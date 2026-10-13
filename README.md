# Homework 05: Campus Customs Multi-Agent Operations

An agent team that works the Campus Customs ticket board: an **MCP server** over the shop's SQLite DB, and a **PydanticAI backend** with five agents (Boss, Inventory, Accounting, Facilities, Customer Service) that delegate to each other. Payments always wait for a human.

**Repo:** https://github.com/ignaciosanur/hw5

## Quick start for graders

Built and tested with Python 3.14 and Node 24. You need a Portkey key for agent runs; the board, cash and approvals work without one.

```bash
git clone https://github.com/ignaciosanur/hw5.git && cd hw5
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # put your PORTKEY_API_KEY in .env (the real .env is never committed)
(cd frontend && npm install)
```

### 1. The databases: original vs. working copy
Both databases are in the repo:

| File | Role |
|---|---|
| `data/campus_customs.db` | The **original** seed. Never modified. |
| `data/campus_customs_new.db` | The **working copy** the MCP server, agents and API read and write. As committed, it holds my finished run: tickets 101–103 resolved, two human-approved payments, checking $160.00. |

**For a clean run, copy the original over the working copy.** Either of these works:
```bash
.venv/bin/python reset_db.py    # copies campus_customs.db -> campus_customs_new.db, then adds the
                                # payment_requests and drafts tables the agents need
```
or, with the dashboard open, use **⋯ → Reset demo** (same thing, through `POST /api/reset`). A plain copy also works, but the original is read-only, so make the copy writable: `cp data/campus_customs.db data/campus_customs_new.db && chmod 644 data/campus_customs_new.db`. The two extra tables are created on the first MCP call.

### 2. Start the MCP server
The backend launches the MCP server (`mcp_server/server.py`, FastMCP, stdio) by itself when it starts, so there is nothing extra to run for the app. To run it on its own (e.g. to connect an MCP client or Claude Code; `.mcp.json` registers it as `campus-customs-ops`):
```bash
.venv/bin/python mcp_server/server.py    # stdio MCP server over data/campus_customs_new.db (15 tools)
```

### 3. Start the FastAPI backend (terminal 1)
```bash
cd backend && source ../.venv/bin/activate
uvicorn main:app --reload --port 8000    # http://localhost:8000  (API docs at /docs)
```

### 4. Start the React board (terminal 2)
```bash
cd frontend
npm run dev                              # http://localhost:5173
```

### 5. Reset the DB before a full three-ticket run
Always start a full run from the seed: **⋯ → Reset demo → confirm** in the board (or `.venv/bin/python reset_db.py` with the backend stopped). Then, in the board:
1. Select **#101** → **Run Agent Team**. When a payment appears under *Needs your decision*, review it, click **Approve**, type your name, then **Confirm payment**. Then run the ticket again so the Boss can close it.
2. Same for **#102** (rent).
3. **#103** needs no payment and resolves in one run.

Expected end state, matching my run: all three `resolved`, checking **$3,400.00 → $160.00** (−$840.00 invoice 501, −$2,400.00 rent). The evidence is in `output/desk_tickets.html` (Expected vs Actual, Cash, Reflection) and `output/resolved_board.html`.

Without the dashboard, the same team runs from the command line: `.venv/bin/python -m backend.run_ticket all --reset`. Every step is appended to `output/audit_trail.json`.

## API (Problem 7)
```bash
cd backend && source ../.venv/bin/activate
uvicorn main:app --reload --port 8000                       # http://localhost:8000, docs at /docs
cd ..
.venv/bin/python -m pytest -q                               # 13 offline tests
RUN_LIVE=1 .venv/bin/python -m pytest -q -k live            # + 1 test that runs the real agents on ticket 102
```
| Route | What it does |
|---|---|
| `GET /api/tickets` | Live board from the `tickets` table: description, real status (`open`, `in_progress`, `waiting_approval`, `blocked`, `resolved`) plus `is_resolved`, the Boss's notes, pending approval and draft IDs, and whether a run is in flight. |
| `POST /api/tickets/{id}/run` | Starts the Boss on the ticket in the background and returns **202** with a `run_id`. 404 for an unknown ticket, 409 if it is already running or resolved. Only the Boss changes status. |
| `GET /api/runs/{run_id}` | `running` / `finished` / `failed`, plus the Boss's decision. |
| `GET /api/events` | Agent activity from `output/audit_trail.json`, oldest first. Filters: `ticket_id`, `run_id`, `after_seq` (for polling), `limit`. Shows events since the last reset unless `include_before_reset=true`. |
| `GET /api/approvals` | Payment and purchase-order requests the agents filed (`status=pending` etc.). |
| `POST /api/approvals/{id}/approve` | Body `{"approved_by": "<name>"}`. **The only route that moves money**: it calls the MCP tool `approve_and_pay` (one SQLite transaction). 404 if missing, 409 if already processed or refused (e.g. not enough cash). Returns the request, the payment and the new balance. |
| `POST /api/approvals/{id}/reject` | Body `{"rejected_by", "reason"}`. No money moves. |
| `GET /api/cash` | Checking balance read from `cash_accounts` on every call, plus pending totals. |
| `POST /api/reset` | **Development only** (403 when `APP_ENV=production`, 409 while a ticket runs). Restores the seeded DB with `reset_db.py` and appends a `reset` marker to the audit trail. |

Assumptions and limits:
- **Currency** is not stored in the DB, so `/api/cash` returns `currency: null`. Amounts are dollars by context.
- **Run registry** (`/api/runs`, `running` flags) lives in memory and is cleared on restart. The audit trail is the durable record. A single server process is assumed.
- **Resolution** is the Boss's call. Approving a payment doesn't resolve a ticket. Re-run the ticket and the Boss sees the payment and decides.
- **Events are never deleted.** Reset appends a marker and the feed starts again after it, so the Problem 5 append-only rule still holds.
- **No auth.** `approved_by` is whatever name the dashboard sends. A real deployment needs login, approval limits and separate approvers (see `output/harness.md`).
- CORS allows `FRONTEND_URL` from `.env` plus `localhost:5173` / `127.0.0.1:5173`.

## Dashboard (Problem 8)
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (needs the backend above on :8000)
```
Pick a ticket, press **Run Agent Team**, watch the Boss delegate and the MCP calls stream in, then approve the payment on the right. Design rationale: `output/design.md`. Reset lives in the "⋯" menu (dev only, asks for confirmation).

## Layout
```
mcp_server/server.py       15 MCP tools over data/campus_customs_new.db
backend/config.py          model (from .env), Portkey client, token/delegation limits
backend/models.py          data types: RunState, TeamDeps, SpecialistReport, TicketDecision
backend/mcp_tools.py       MCP connection + per-agent tool allow-lists
backend/audit.py           append-only audit trail
backend/agents/            base.py (delegate tool, agent loop) + one file per agent
backend/prompts/           one prompt per agent
backend/run_ticket.py      command-line runner
backend/main.py            FastAPI routes (Problem 7)
backend/db.py              read-only queries for the API
tests/                     pytest suite for the API
frontend/                  React + Vite + TypeScript ops desk (Problem 8)
output/                    harness.md, mcp_smoke.json, audit_trail.json
```

## Prompt → deliverable map
| Problem | Deliverables |
|---|---|
| 1 Vibe coder prompts | `AI_prompts.md` |
| 2 Study the DB | `output/harness.md` (tables), `data/campus_customs_new.db` |
| 3 MCP server | `mcp_server/server.py`, `mcp_server/README.md`, `output/harness.md` |
| 4 Connect + test tools | `.mcp.json`, `output/mcp_smoke.json` |
| 5 Agent team | `backend/`, `output/audit_trail.json`, `output/harness.md` (agents, tools, safety), `mcp_server/README.md` |
| 6 Plan the tickets | `output/desk_tickets.html` (Expected plans; Actual, Cash, Reflection left for later) |
| 7 Backend routes | `backend/main.py`, `backend/db.py`, `backend/models.py` (API types), `tests/test_api.py` |
| 8 Dashboard | `frontend/`, `output/design.md`, small API additions in `backend/main.py` / `backend/db.py` |
| 9 Resolve the tickets | `output/desk_tickets.html` (Actual + Cash), `output/resolved_tickets.json`, `output/resolved_board.html` (+ `output/screenshots/`), `output/audit_trail.json`, `output/harness.md` (final A–H docs) |
| 10 Reflection | `output/desk_tickets.html` (Reflection tab) |
| 11 Submit to GitHub | public repo, `output/github_url.txt`, both DBs in `data/`, README quick start |
