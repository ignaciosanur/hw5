"""FastAPI backend for the Campus Customs ops desk.

Routes (all JSON):
  GET  /api/tickets                      live ticket board from the DB
  POST /api/tickets/{ticket_id}/run      start the agent team on a ticket (202 + run_id; runs in background)
  GET  /api/runs/{run_id}                status/result of one run
  GET  /api/events                       agent activity from output/audit_trail.json (poll it)
  GET  /api/approvals                    payment / purchase-order requests the agents filed
  POST /api/approvals/{approval_id}/approve   HUMAN approval: the only route that moves money
  POST /api/approvals/{approval_id}/reject    HUMAN rejection: no money moves
  GET  /api/cash                         checking balance, straight from cash_accounts
  POST /api/reset                        dev only: restore the seeded DB (events are kept; a marker is appended)

Start (from the backend/ folder, venv active):  uvicorn main:app --reload --port 8000
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# Started as `uvicorn main:app` from backend/, the project root isn't on sys.path yet.
# Add it so the `backend.*` package and the root-level reset_db.py import the same way
# as from the CLI and the tests.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend import audit, db
from backend.config import AUDIT_PATH
from backend.mcp_tools import shop_mcp
from backend.models import (ApprovalOut, ApprovalResult, ApproveIn, CashAccountOut, CashOut, EventOut, RejectIn,
                            ResetOut, RunAccepted, RunOut, RunSummary, TicketOut)
from backend.run_ticket import new_run_id, run_ticket
from reset_db import reset_working_db

APP_ENV = os.getenv("APP_ENV", "development").lower()
ALLOWED_ORIGINS = sorted({o.rstrip("/") for o in [
    os.getenv("FRONTEND_URL", ""), "http://localhost:5173", "http://127.0.0.1:5173",
] if o})

# In-memory run registry (one backend process). The audit trail is the durable record.
RUNS: dict[str, dict] = {}
ACTIVE: dict[int, str] = {}          # ticket_id -> run_id currently running
TASKS: set[asyncio.Task] = set()     # keep references so background runs aren't garbage-collected
MONEY_LOCK = asyncio.Lock()          # approvals and resets never overlap


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with shop_mcp:             # one MCP server process for the app's lifetime
        yield


app = FastAPI(title="Campus Customs Ops API", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.exception_handler(db.DatabaseUnavailable)
async def db_unavailable(_, exc: db.DatabaseUnavailable):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def call_mcp(tool: str, args: dict) -> dict:
    """Backend-side MCP call on the *unfiltered* toolset (the human-only tools live here)."""
    try:
        return await shop_mcp.direct_call_tool(tool, args)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"MCP tool {tool} failed: {exc}") from exc


# ------------------------------------------------------------------ helpers

def latest_runs(trail: list[dict]) -> dict[int, RunSummary]:
    """Latest run per ticket since the last reset, from run_started / run_finished events."""
    runs: dict[int, RunSummary] = {}
    for e in trail:
        tid = e.get("ticket_id")
        if e["event"] == "run_started" and tid is not None:
            live = RUNS.get(e["run_id"], {}).get("status") == "running"
            runs[tid] = RunSummary(run_id=e["run_id"], status="running" if live else "interrupted", started_at=e["ts"])
        elif e["event"] == "run_finished" and tid in runs and runs[tid].run_id == e["run_id"]:
            d = e.get("detail") or {}
            runs[tid] = runs[tid].model_copy(update={
                "status": "finished" if d.get("ok") else "failed", "finished_at": e["ts"],
                "decision": d.get("decision"), "error": d.get("error")})
    return runs


def since_reset(trail: list[dict]) -> list[dict]:
    last_reset = max((e["seq"] for e in trail if e["event"] == "reset"), default=0)
    return [e for e in trail if e["seq"] > last_reset]


def ticket_out(t: dict, requests: list[dict], drafts: list[dict], last_run: RunSummary | None = None) -> TicketOut:
    original, *decisions = (t["notes"] or "").split("\n[")
    return TicketOut(
        **{k: t[k] for k in ("id", "type", "requester", "subject", "status", "sku", "size", "qty",
                             "lease_id", "invoice_id", "created_at")},
        description=original.strip(),
        is_resolved=t["status"] == "resolved",
        decision_notes=["[" + d.strip() for d in decisions],
        pending_approval_ids=[r["id"] for r in requests if r["ticket_id"] == t["id"] and r["status"] == "pending"],
        draft_ids=[d["id"] for d in drafts if d["ticket_id"] == t["id"]],
        running=t["id"] in ACTIVE,
        last_run_id=last_run.run_id if last_run else None,
        last_run=last_run,
    )


def cash_out() -> CashOut:
    accounts = db.cash_accounts()
    if not accounts:
        raise db.DatabaseUnavailable("cash_accounts is empty.")
    checking = next((a for a in accounts if a["name"] == "checking"), accounts[0])
    pending = sum(r["amount"] for r in db.payment_requests(status="pending"))
    return CashOut(account=checking["name"], balance=checking["balance"], as_of=checking["date"],
                   accounts=[CashAccountOut(name=a["name"], balance=a["balance"], as_of=a["date"]) for a in accounts],
                   pending_approvals_total=round(pending, 2),
                   balance_if_all_pending_approved=round(checking["balance"] - pending, 2))


def read_trail() -> list[dict]:
    if not AUDIT_PATH.exists():
        return []
    try:
        return json.loads(AUDIT_PATH.read_text())
    except json.JSONDecodeError:
        return []


def summarize(e: dict) -> str:
    d, ev = e.get("detail") or {}, e["event"]
    if ev == "model_response":
        calls = [c["tool"] for c in d.get("tool_calls", []) if c["tool"] != "final_result"]
        if calls:
            return "calls " + ", ".join(calls)
        return "final answer" if any(c["tool"] == "final_result" for c in d.get("tool_calls", [])) else (d.get("text") or "")[:160]
    if ev == "model_request":
        tools = [r["tool"] for r in d.get("tool_results", []) if r["tool"] != "final_result"]
        return ("got results from " + ", ".join(tools)) if tools else "thinking"
    if ev in ("delegation_started", "delegation_refused"):
        return f"{'asks' if ev == 'delegation_started' else 'refused hand-off to'} {d.get('to_agent')}: {(d.get('task') or '')[:140]}"
    if ev == "delegation_done":
        return f"{d.get('to_agent')} reported back"
    if ev == "delegation_failed":
        return f"{d.get('to_agent')} failed: {d.get('error', '')[:140]}"
    if ev == "run_finished":
        if d.get("ok"):
            dec = d.get("decision") or {}
            return f"finished: {dec.get('status')} — {(dec.get('decision') or '')[:140]}"
        return f"failed: {(d.get('error') or '')[:160]}"
    if ev == "approval":
        return f"{d.get('approved_by')} approved request {d.get('request_id')} (${d.get('amount')})"
    if ev == "rejection":
        return f"{d.get('rejected_by')} rejected request {d.get('request_id')}"
    return {"run_started": "run started", "user_prompt": "received the task", "end": "done", "reset": "database reset"}.get(ev, ev)


# ------------------------------------------------------------------ A. tickets

@app.get("/api/tickets", response_model=list[TicketOut])
def get_tickets():
    requests, drafts = db.payment_requests(), db.drafts()
    runs = latest_runs(since_reset(read_trail()))
    return [ticket_out(t, requests, drafts, runs.get(t["id"])) for t in db.tickets()]


# ------------------------------------------------------------------ B. run a ticket

async def _run_in_background(ticket_id: int, run_id: str) -> None:
    try:
        result = await run_ticket(ticket_id, run_id)   # never raises; failures come back ok=False
        RUNS[run_id].update(status="finished" if result.get("ok") else "failed", result=result)
    except Exception as exc:                            # belt and braces: always release the ticket
        RUNS[run_id].update(status="failed", result={"ok": False, "error": f"{type(exc).__name__}: {exc}"})
    finally:
        RUNS[run_id]["finished_at"] = now()
        ACTIVE.pop(ticket_id, None)


@app.post("/api/tickets/{ticket_id}/run", status_code=202, response_model=RunAccepted)
async def run_ticket_route(ticket_id: int):
    t = db.ticket(ticket_id)
    if t is None:
        raise HTTPException(404, f"No ticket {ticket_id}.")
    if t["status"] == "resolved":
        raise HTTPException(409, f"Ticket {ticket_id} is already resolved.")
    if MONEY_LOCK.locked():
        raise HTTPException(409, "A reset or approval is in progress; try again in a moment.")
    if ticket_id in ACTIVE:  # check-and-set with no await in between: atomic on the event loop
        raise HTTPException(409, f"Ticket {ticket_id} is already running as {ACTIVE[ticket_id]}.")
    run_id = new_run_id()
    ACTIVE[ticket_id] = run_id
    RUNS[run_id] = {"run_id": run_id, "ticket_id": ticket_id, "status": "running", "started_at": now(),
                    "finished_at": None, "result": None}
    task = asyncio.create_task(_run_in_background(ticket_id, run_id))
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)
    return RunAccepted(run_id=run_id, ticket_id=ticket_id, events_url=f"/api/events?run_id={run_id}")


@app.get("/api/runs/{run_id}", response_model=RunOut)
def get_run(run_id: str):
    if run_id not in RUNS:
        raise HTTPException(404, f"No run {run_id} in this server session (see /api/events for older runs).")
    return RunOut(**RUNS[run_id])


# ------------------------------------------------------------------ C. events

@app.get("/api/events", response_model=list[EventOut])
def get_events(ticket_id: int | None = None, run_id: str | None = None,
               after_seq: int = Query(0, ge=0, description="Only events newer than this seq (for polling)."),
               limit: int = Query(200, ge=1, le=1000),
               include_before_reset: bool = False):
    trail = read_trail()
    if not include_before_reset:
        trail = since_reset(trail)
    trail = [e for e in trail if e["seq"] > after_seq
             and (ticket_id is None or e.get("ticket_id") == ticket_id)
             and (run_id is None or e.get("run_id") == run_id)]
    return [EventOut(seq=e["seq"], ts=e["ts"], run_id=e.get("run_id"), ticket_id=e.get("ticket_id"),
                     agent=e.get("agent"), depth=e.get("depth"), event=e["event"], summary=summarize(e),
                     detail=e.get("detail") or {}) for e in trail[-limit:]]


# ------------------------------------------------------------------ D. approvals (human in the loop)

@app.get("/api/approvals", response_model=list[ApprovalOut])
def get_approvals(status: str | None = Query(None, pattern="^(pending|paid|rejected)$"), ticket_id: int | None = None):
    return [ApprovalOut(**r) for r in db.payment_requests(status=status, ticket_id=ticket_id)]


@app.post("/api/approvals/{approval_id}/approve", response_model=ApprovalResult)
async def approve(approval_id: int, body: ApproveIn):
    async with MONEY_LOCK:
        req = db.payment_request(approval_id)
        if req is None:
            raise HTTPException(404, f"No approval request {approval_id}.")
        if req["status"] != "pending":
            raise HTTPException(409, {"message": f"Request {approval_id} is already {req['status']}; nothing was charged.",
                                      "approval": req})
        # The money moves in ONE place: the MCP tool approve_and_pay, one SQLite transaction
        # (payment row + invoice paid / lease advanced + cash debit + request marked paid).
        result = await call_mcp("approve_and_pay", {"request_id": approval_id, "approved_by": body.approved_by})
        if not result.get("ok"):
            raise HTTPException(409, {"message": result.get("message"), "refused": result.get("refused"),
                                      "approval": db.payment_request(approval_id)})
    await audit.append(None, "approval", ticket_id=req["ticket_id"], actor="human", **result)
    return ApprovalResult(approval=ApprovalOut(**db.payment_request(approval_id)), payment=result, cash=cash_out())


@app.post("/api/approvals/{approval_id}/reject", response_model=ApprovalOut)
async def reject(approval_id: int, body: RejectIn):
    async with MONEY_LOCK:
        req = db.payment_request(approval_id)
        if req is None:
            raise HTTPException(404, f"No approval request {approval_id}.")
        result = await call_mcp("reject_payment_request", {"request_id": approval_id,
                                                           "rejected_by": body.rejected_by, "reason": body.reason})
        if not result.get("ok"):
            raise HTTPException(409, result.get("message"))
    await audit.append(None, "rejection", ticket_id=req["ticket_id"], actor="human", request_id=approval_id, rejected_by=body.rejected_by, reason=body.reason)
    return ApprovalOut(**db.payment_request(approval_id))


# ------------------------------------------------------------------ E. cash

@app.get("/api/cash", response_model=CashOut)
def get_cash():
    return cash_out()


# ------------------------------------------------------------------ F. reset (development only)

@app.post("/api/reset", response_model=ResetOut)
async def reset():
    if APP_ENV == "production":
        raise HTTPException(403, "Reset is disabled in production.")
    if ACTIVE:
        raise HTTPException(409, f"Can't reset while tickets are running: {sorted(ACTIVE)}.")
    async with MONEY_LOCK:
        try:
            reset_working_db()
        except Exception as exc:
            raise HTTPException(500, f"Reset failed: {exc}") from exc
    tickets = [{"id": t["id"], "status": t["status"]} for t in db.tickets()]
    await audit.append(None, "reset", actor="human", tickets=tickets)  # events are never deleted; the feed restarts after this marker
    marker = max(e["seq"] for e in read_trail() if e["event"] == "reset")
    return ResetOut(ok=True, tickets=tickets, cash=cash_out(), payments=db.count("payments"),
                    pending_approvals=len(db.payment_requests(status="pending")), drafts=db.count("drafts"),
                    events_marker_seq=marker)


@app.get("/")
def index():
    return {"service": "Campus Customs Ops API", "docs": "/docs",
            "routes": sorted({r.path for r in app.routes if r.path.startswith("/api")})}


@app.get("/api/health")
def health():
    last_reset = max((e["seq"] for e in read_trail() if e["event"] == "reset"), default=0)
    return {"ok": True, "env": APP_ENV, "reset_enabled": APP_ENV != "production",
            "last_reset_seq": last_reset,  # the dashboard drops its cached events when this changes
            "active_runs": ACTIVE, "allowed_origins": ALLOWED_ORIGINS}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("BACKEND_PORT") or 8000))
