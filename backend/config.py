"""Model + limits for the whole agent team.

Every agent uses the one model named in .env (OPENAI_MODEL), reached through Portkey.
The Responses API is required: the course model rejects function tools over chat/completions.
"""
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

PROMPTS_DIR = ROOT / "backend" / "prompts"
AUDIT_PATH = ROOT / "output" / "audit_trail.json"
MCP_SERVER_SCRIPT = ROOT / "mcp_server" / "mcp_server.py"

MODEL_NAME = os.getenv("OPENAI_MODEL", "")
PORTKEY_BASE_URL = (os.getenv("PORTKEY_BASE_URL") or "https://api.portkey.ai/v1").rstrip("/")

# Token / loop guardrails, shared by every agent working on one ticket.
TEAM_LIMITS = UsageLimits(
    request_limit=40,          # model calls across the whole team for one ticket
    tool_calls_limit=60,       # MCP + delegate calls across the team
    total_tokens_limit=250_000,
)
MAX_DELEGATION_DEPTH = 3       # boss -> A -> B -> C, no deeper
MAX_DELEGATIONS_PER_TICKET = 8
AUDIT_CLIP_CHARS = 1500        # long tool outputs are clipped in the audit trail


@lru_cache(maxsize=1)
def build_model() -> OpenAIResponsesModel:
    key = os.getenv("PORTKEY_API_KEY", "").strip()
    if not key or not MODEL_NAME:
        raise RuntimeError("PORTKEY_API_KEY and OPENAI_MODEL must be set in .env")
    client = AsyncOpenAI(api_key=key, base_url=PORTKEY_BASE_URL, default_headers={"x-portkey-api-key": key})
    return OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))
