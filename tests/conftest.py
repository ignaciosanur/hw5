import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import audit  # noqa: E402
import backend.main as main  # noqa: E402


def pytest_configure(config):
    config.addinivalue_line("markers", "live: calls the real LLM agents (set RUN_LIVE=1)")


def pytest_collection_modifyitems(config, items):
    if os.getenv("RUN_LIVE") != "1":
        skip = pytest.mark.skip(reason="live agent test; run with RUN_LIVE=1")
        for item in items:
            if "live" in item.keywords:
                item.add_marker(skip)


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    # Tests write their events to a scratch file, never to the graded output/audit_trail.json.
    real_trail = audit.AUDIT_PATH
    trail = tmp_path_factory.mktemp("audit") / "audit_trail.json"
    audit.AUDIT_PATH = trail
    main.AUDIT_PATH = trail
    with TestClient(main.app) as c:
        yield c
        # Leave the working DB seeded, and record that reset in the REAL trail so the
        # dashboard's feed (events since the last reset) matches the DB again.
        audit.AUDIT_PATH = main.AUDIT_PATH = real_trail
        c.post("/api/reset")


@pytest.fixture
def fresh(client):
    r = client.post("/api/reset")
    assert r.status_code == 200, r.text
    return client


def mcp(client, tool: str, **args) -> dict:
    """Call an MCP tool on the app's own connection (how an agent would propose a payment)."""
    return client.portal.call(main.shop_mcp.direct_call_tool, tool, args)
