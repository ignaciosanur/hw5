"""Test isolation: the suite never touches the graded working DB or the real audit trail.

CC_WORKING_DB is set to a throwaway file *before* the backend is imported, so the API,
the MCP server subprocess and reset_db.py all use the temp copy.
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REAL_DB = (ROOT / "data" / "campus_customs_new.db").resolve()
TMP = Path(tempfile.mkdtemp(prefix="cc-tests-"))
os.environ["CC_WORKING_DB"] = str(TMP / "campus_customs_test.db")
sys.path.insert(0, str(ROOT))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend import audit, config  # noqa: E402
import backend.main as main  # noqa: E402

assert config.WORKING_DB.resolve() != REAL_DB, "tests must not use the real working DB"


def pytest_configure(config):
    config.addinivalue_line("markers", "live: calls the real LLM agents (set RUN_LIVE=1)")


def pytest_collection_modifyitems(config, items):
    if os.getenv("RUN_LIVE") != "1":
        skip = pytest.mark.skip(reason="live agent test; run with RUN_LIVE=1")
        for item in items:
            if "live" in item.keywords:
                item.add_marker(skip)


@pytest.fixture(scope="session")
def client():
    # Events go to a scratch file, never to the graded output/audit_trail.json.
    trail = TMP / "audit_trail.json"
    audit.AUDIT_PATH = trail
    main.AUDIT_PATH = trail
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def fresh(client):
    r = client.post("/api/reset")
    assert r.status_code == 200, r.text
    return client


def mcp(client, tool: str, **args) -> dict:
    """Call an MCP tool on the app's own connection (how an agent would propose a payment)."""
    return client.portal.call(main.shop_mcp.direct_call_tool, tool, args)
