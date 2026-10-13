"""Append-only audit trail: output/audit_trail.json stays one JSON array that only grows.

Every agent-loop node (prompt, model request, model response, tool results, end) and every
delegation is appended as its own entry, so a run can be replayed and checked later.
"""
import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

from pydantic_ai import Agent
from pydantic_ai.messages import RetryPromptPart, TextPart, ToolCallPart, ToolReturnPart

from backend.config import AUDIT_CLIP_CHARS, AUDIT_PATH, MODEL_NAME
from backend.models import TeamDeps

_lock = asyncio.Lock()


def clip(value: Any, limit: int = AUDIT_CLIP_CHARS) -> str:
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    return text if len(text) <= limit else text[:limit] + f"... (+{len(text) - limit} chars clipped)"


def _usage(deps: TeamDeps) -> dict:
    u = deps.run.usage
    return {"requests": u.requests, "tool_calls": u.tool_calls,
            "input_tokens": u.input_tokens, "output_tokens": u.output_tokens}


async def append(deps: TeamDeps | None, event: str, step: int | None = None, *,
                 ticket_id: int | None = None, actor: str | None = None, **detail: Any) -> None:
    """deps = an agent's step. Without deps (human approvals, resets) pass ticket_id/actor directly."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "run_id": deps.run.run_id if deps else None,
        "ticket_id": deps.run.ticket_id if deps else ticket_id,
        "agent": deps.agent if deps else actor,
        "depth": deps.depth if deps else None,
        "chain": list(deps.chain) if deps else None,
        "step": step,
        "event": event,
        "model": MODEL_NAME,
        "detail": detail,
        "team_usage_so_far": _usage(deps) if deps else None,
    }
    async with _lock:  # read-append-write, then atomic rename: never wiped, never half-written
        AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        try:
            trail = json.loads(AUDIT_PATH.read_text()) if AUDIT_PATH.exists() else []
        except json.JSONDecodeError:
            AUDIT_PATH.rename(AUDIT_PATH.with_suffix(".corrupt.json"))  # keep it, start fresh
            trail = []
        entry["seq"] = len(trail) + 1
        trail.append(entry)
        tmp = AUDIT_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(trail, indent=1, default=str))
        os.replace(tmp, AUDIT_PATH)


async def log_node(deps: TeamDeps, step: int, node: Any) -> None:
    """One audit entry per PydanticAI agent-loop node."""
    if Agent.is_user_prompt_node(node):
        await append(deps, "user_prompt", step, prompt=clip(node.user_prompt))
    elif Agent.is_model_request_node(node):
        parts = node.request.parts
        returns = [{"tool": p.tool_name, "tool_call_id": p.tool_call_id, "result": clip(p.model_response_str())}
                   for p in parts if isinstance(p, ToolReturnPart)]
        retries = [clip(p.model_response(), 400) for p in parts if isinstance(p, RetryPromptPart)]
        await append(deps, "model_request", step, tool_results=returns, retries=retries,
                     parts=[type(p).__name__ for p in parts])
    elif Agent.is_call_tools_node(node):
        resp = node.model_response
        calls = [{"tool": p.tool_name, "tool_call_id": p.tool_call_id, "args": p.args_as_dict()}
                 for p in resp.parts if isinstance(p, ToolCallPart)]
        text = "".join(p.content for p in resp.parts if isinstance(p, TextPart))
        u = resp.usage
        await append(deps, "model_response", step, text=clip(text), tool_calls=calls,
                     response_tokens={"input": u.input_tokens, "output": u.output_tokens,
                                      "cache_read": u.cache_read_tokens})
    elif Agent.is_end_node(node):
        out = node.data.output
        # Agent outputs are small structured reports; keep them whole so the dashboard can read them.
        await append(deps, "end", step, output=out.model_dump() if hasattr(out, "model_dump") else clip(out))
