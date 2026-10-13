"""Run the agent team on open tickets from the command line.

    .venv/bin/python -m backend.run_ticket 101          # one ticket
    .venv/bin/python -m backend.run_ticket all --reset  # fresh DB, every open ticket

The Boss starts each ticket; teammates are pulled in through `delegate`. Every step is
appended to output/audit_trail.json. No money moves: payments wait for a human.
"""
import argparse
import asyncio
import json
import uuid

from pydantic_ai.exceptions import UsageLimitExceeded

from backend import audit
from backend.agents import run_agent
from backend.config import TEAM_LIMITS
from backend.mcp_tools import shop_mcp
from backend.models import RunState, TeamDeps


def new_run_id() -> str:
    return f"run-{uuid.uuid4().hex[:8]}"


async def run_ticket(ticket_id: int, run_id: str | None = None) -> dict:
    """Boss works one ticket end to end. Never raises: failures come back as ok=False."""
    run = RunState(run_id=run_id or new_run_id(), ticket_id=ticket_id)
    deps = TeamDeps(run=run, agent="boss", chain=["boss"])
    await audit.append(deps, "run_started", limits={"request_limit": TEAM_LIMITS.request_limit,
                                                    "tool_calls_limit": TEAM_LIMITS.tool_calls_limit,
                                                    "total_tokens_limit": TEAM_LIMITS.total_tokens_limit})
    try:
        decision = await run_agent("boss", f"Handle ticket {ticket_id}.", deps)
        result = {"ok": True, "decision": decision.model_dump()}
    except UsageLimitExceeded as exc:
        result = {"ok": False, "error": f"Team budget reached: {exc}"}
    except Exception as exc:
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    await audit.append(deps, "run_finished", delegations=run.delegations, **result)
    return {"run_id": run.run_id, "ticket_id": ticket_id, "usage": audit._usage(deps), **result}


async def main(ticket_ids: list[int] | None) -> None:
    async with shop_mcp:  # one MCP server process for the whole batch
        if ticket_ids is None:
            board = await shop_mcp.direct_call_tool("list_open_tickets", {})
            ticket_ids = [t["id"] for t in board["tickets"]]
        for tid in ticket_ids:
            print(json.dumps(await run_ticket(tid), indent=2), flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("tickets", nargs="+", help="ticket ids, or 'all' for every open ticket")
    p.add_argument("--reset", action="store_true", help="reset the working DB first")
    args = p.parse_args()
    if args.reset:
        from reset_db import reset_working_db
        reset_working_db()
        print("Reset the working DB")
    ids = None if args.tickets == ["all"] else [int(t) for t in args.tickets]
    asyncio.run(main(ids))
