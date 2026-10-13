"""API tests for backend/main.py. Run: .venv/bin/python -m pytest -q
The live agent test calls the LLM and is skipped unless RUN_LIVE=1."""
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

import backend.main as main
from backend.db import DB_PATH
from tests.conftest import mcp

SEED_CASH = 3400.0


def snapshot() -> dict:
    conn = sqlite3.connect(DB_PATH)
    tables = ["desk", "inventory", "pricing", "vendors", "leases", "cash_accounts", "payments", "invoices",
              "tickets", "payment_requests", "drafts"]
    snap = {t: conn.execute(f"SELECT * FROM {t} ORDER BY 1").fetchall() for t in tables}
    conn.close()
    return snap


# ---------------------------------------------------------------- A. tickets
def test_tickets_come_from_db(fresh):
    r = fresh.get("/api/tickets")
    assert r.status_code == 200
    tickets = {t["id"]: t for t in r.json()}
    assert set(tickets) == {101, 102, 103}
    assert all(t["status"] == "open" and not t["is_resolved"] for t in tickets.values())
    assert tickets[101]["description"] == "Needs a tee in size S."
    # change the DB through MCP; the API must show it without a restart
    mcp(fresh, "update_ticket", ticket_id=102, status="waiting_approval", note="test", updated_by="test")
    t102 = next(t for t in fresh.get("/api/tickets").json() if t["id"] == 102)
    assert t102["status"] == "waiting_approval" and t102["decision_notes"] == ["[2026-08-31 test] test"]


# ---------------------------------------------------------------- B. run validation (no LLM)
def test_run_unknown_ticket_is_404(fresh):
    assert fresh.post("/api/tickets/999/run").status_code == 404
    assert fresh.post("/api/tickets/abc/run").status_code == 422


def test_run_resolved_ticket_is_409(fresh):
    mcp(fresh, "update_ticket", ticket_id=101, status="resolved", note="test", updated_by="test")
    assert fresh.post("/api/tickets/101/run").status_code == 409


def test_run_already_running_is_409(fresh):
    main.ACTIVE[103] = "run-fake"  # simulate a run in flight
    try:
        r = fresh.post("/api/tickets/103/run")
        assert r.status_code == 409 and "already running" in r.json()["detail"]
        assert fresh.post("/api/reset").status_code == 409  # no reset under a running ticket
    finally:
        main.ACTIVE.pop(103, None)


# ---------------------------------------------------------------- D/E. money
def test_proposing_a_payment_does_not_move_cash(fresh):
    req = mcp(fresh, "request_payment", kind="rent", ref_id=1, requested_by="accounting", reason="t", ticket_id=102)
    assert req["ok"] and req["status"] == "pending"
    cash = fresh.get("/api/cash").json()
    assert cash["balance"] == SEED_CASH and cash["account"] == "checking"
    assert cash["pending_approvals_total"] == 2400.0 and cash["balance_if_all_pending_approved"] == 1000.0
    (pending,) = fresh.get("/api/approvals?status=pending").json()
    assert pending["id"] == req["request_id"] and pending["payee"] == "Elm City Properties"
    assert pending["description"].startswith("Rent for Chapel Street shop")
    assert snapshot()["payments"] == []


def test_approve_applies_once(fresh):
    rid = mcp(fresh, "request_payment", kind="rent", ref_id=1, requested_by="accounting", reason="t", ticket_id=102)["request_id"]
    r = fresh.post(f"/api/approvals/{rid}/approve", json={"approved_by": "Ignacio"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["approval"]["status"] == "paid" and body["approval"]["decided_by"] == "Ignacio"
    assert body["payment"]["lease_next_due"] == "2026-10-02"
    assert body["cash"]["balance"] == 1000.0
    again = fresh.post(f"/api/approvals/{rid}/approve", json={"approved_by": "Ignacio"})
    assert again.status_code == 409
    snap = snapshot()
    assert len(snap["payments"]) == 1 and snap["payments"][0][-1] == "Ignacio"
    assert fresh.get("/api/cash").json()["balance"] == 1000.0


def test_concurrent_approvals_charge_once(fresh):
    rid = mcp(fresh, "request_payment", kind="invoice", ref_id=501, requested_by="accounting", reason="t", ticket_id=101)["request_id"]
    with ThreadPoolExecutor(5) as pool:
        codes = list(pool.map(lambda _: fresh.post(f"/api/approvals/{rid}/approve", json={"approved_by": "A"}).status_code, range(5)))
    assert sorted(codes) == [200, 409, 409, 409, 409]
    assert fresh.get("/api/cash").json()["balance"] == SEED_CASH - 840
    assert len(snapshot()["payments"]) == 1


def test_insufficient_cash_is_refused_without_changes(fresh):
    for kind, ref in (("rent", 1), ("invoice", 501)):
        rid = mcp(fresh, "request_payment", kind=kind, ref_id=ref, requested_by="accounting", reason="t")["request_id"]
        assert fresh.post(f"/api/approvals/{rid}/approve", json={"approved_by": "A"}).status_code == 200
    po = mcp(fresh, "request_payment", kind="purchase_order", vendor_id=1, sku="CC-HOOD-NAVY", size="M", qty=12,
             requested_by="accounting", reason="t", ticket_id=103)
    before = snapshot()
    r = fresh.post(f"/api/approvals/{po['request_id']}/approve", json={"approved_by": "A"})
    assert r.status_code == 409 and r.json()["detail"]["refused"] == "insufficient_cash"
    assert snapshot() == before and fresh.get("/api/cash").json()["balance"] == 160.0


def test_approval_errors(fresh):
    assert fresh.post("/api/approvals/999/approve", json={"approved_by": "A"}).status_code == 404
    rid = mcp(fresh, "request_payment", kind="rent", ref_id=1, requested_by="accounting", reason="t")["request_id"]
    assert fresh.post(f"/api/approvals/{rid}/approve", json={"approved_by": ""}).status_code == 422
    assert fresh.post(f"/api/approvals/{rid}/approve", json={}).status_code == 422
    r = fresh.post(f"/api/approvals/{rid}/reject", json={"rejected_by": "A", "reason": "no"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    assert fresh.post(f"/api/approvals/{rid}/approve", json={"approved_by": "A"}).status_code == 409
    assert fresh.get("/api/cash").json()["balance"] == SEED_CASH


# ---------------------------------------------------------------- C. events
def test_events_are_filtered_and_restart_after_reset(fresh):
    rid = mcp(fresh, "request_payment", kind="rent", ref_id=1, requested_by="accounting", reason="t", ticket_id=102)["request_id"]
    fresh.post(f"/api/approvals/{rid}/approve", json={"approved_by": "A"})
    events = fresh.get("/api/events?ticket_id=102").json()
    assert [e["event"] for e in events] == ["approval"] and events[0]["agent"] == "human"
    assert fresh.get("/api/events?ticket_id=101").json() == []
    last = events[-1]["seq"]
    assert fresh.get(f"/api/events?after_seq={last}").json() == []
    fresh.post("/api/reset")
    assert fresh.get("/api/events").json() == []                      # feed restarts
    old = fresh.get("/api/events?include_before_reset=true").json()   # but nothing was deleted
    assert any(e["event"] == "approval" for e in old) and any(e["event"] == "reset" for e in old)


# ---------------------------------------------------------------- F. reset
def test_reset_restores_seed_every_time(fresh):
    seed = snapshot()
    rid = mcp(fresh, "request_payment", kind="rent", ref_id=1, requested_by="accounting", reason="t")["request_id"]
    fresh.post(f"/api/approvals/{rid}/approve", json={"approved_by": "A"})
    mcp(fresh, "save_customer_draft", ticket_id=101, subject="s", body="b", created_by="customer_service")
    assert snapshot() != seed
    r = fresh.post("/api/reset").json()
    assert snapshot() == seed
    assert r["cash"]["balance"] == SEED_CASH and r["payments"] == 0 and r["pending_approvals"] == 0 and r["drafts"] == 0
    assert all(t["status"] == "open" for t in r["tickets"])
    fresh.post("/api/reset")
    assert snapshot() == seed


def test_reset_disabled_in_production(fresh, monkeypatch):
    monkeypatch.setattr(main, "APP_ENV", "production")
    assert fresh.post("/api/reset").status_code == 403


def test_cors_allows_dev_frontend_only(fresh):
    ok = fresh.options("/api/tickets", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = fresh.options("/api/tickets", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


# ---------------------------------------------------------------- live: the real agent team
@pytest.mark.live
def test_live_run_ticket_102(fresh):
    r = fresh.post("/api/tickets/102/run")
    assert r.status_code == 202, r.text
    run_id = r.json()["run_id"]
    assert fresh.post("/api/tickets/102/run").status_code == 409            # no duplicate run
    assert fresh.get("/api/cash").status_code == 200                         # API stays responsive mid-run
    deadline = time.time() + 300
    while (run := fresh.get(f"/api/runs/{run_id}").json())["status"] == "running":
        assert time.time() < deadline, "run took too long"
        time.sleep(2)
    assert run["status"] == "finished", run
    events = fresh.get(f"/api/events?run_id={run_id}&limit=1000").json()
    kinds = {e["event"] for e in events}
    assert {"run_started", "model_response", "delegation_started", "run_finished"} <= kinds
    assert all(e["ticket_id"] == 102 for e in events)
    assert {"boss", "facilities"} <= {e["agent"] for e in events}
    assert fresh.get("/api/cash").json()["balance"] == SEED_CASH             # proposing moved no money
    ticket = next(t for t in fresh.get("/api/tickets").json() if t["id"] == 102)
    assert ticket["status"] == "waiting_approval" and not ticket["is_resolved"]
    (pending,) = ticket["pending_approval_ids"]
    assert fresh.post(f"/api/approvals/{pending}/approve", json={"approved_by": "Ignacio"}).json()["cash"]["balance"] == 1000.0
