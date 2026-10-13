# Homework 05: Campus Customs Multi-Agent Operations

An agent team that works the Campus Customs ticket board: an **MCP server** over the shop's SQLite DB, and a **PydanticAI backend** with five agents (Boss, Inventory, Accounting, Facilities, Customer Service) that delegate to each other. Payments always wait for a human.

## Setup
```bash
python3.14 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # fill in PORTKEY_API_KEY; OPENAI_MODEL is already set
.venv/bin/python smoke_test.py
```
Put `campus_customs.db` in `data/` (not committed), then create the working copy:
```bash
.venv/bin/python reset_db.py
```

## Run
```bash
.venv/bin/python -m backend.run_ticket 101          # one ticket
.venv/bin/python -m backend.run_ticket all --reset  # fresh DB, every open ticket
```
Each step is appended to `output/audit_trail.json`.

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
mcp_server/mcp_server.py   15 MCP tools over data/campus_customs_new.db
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
| 3 MCP server | `mcp_server/mcp_server.py`, `mcp_server/README.md`, `output/harness.md` |
| 4 Connect + test tools | `.mcp.json`, `output/mcp_smoke.json` |
| 5 Agent team | `backend/`, `output/audit_trail.json`, `output/harness.md` (agents, tools, safety), `mcp_server/README.md` |
| 6 Plan the tickets | `output/desk_tickets.html` (Expected plans; Actual, Cash, Reflection left for later) |
| 7 Backend routes | `backend/main.py`, `backend/db.py`, `backend/models.py` (API types), `tests/test_api.py` |
| 8 Dashboard | `frontend/`, `output/design.md`, small API additions in `backend/main.py` / `backend/db.py` |
| 9 Resolve the tickets | `output/desk_tickets.html` (Actual + Cash), `output/resolved_tickets.json`, `output/resolved_board.html` (+ `output/screenshots/`), `output/audit_trail.json`, `output/harness.md` (final A–H docs) |
