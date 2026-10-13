# Harness — Campus Customs Multi-Agent Operations

Engineering notes for the agent team, grown one problem at a time.

## Problem 2: The database

- Original: `data/campus_customs.db`, read-only, never modified.
- Working copy: `data/campus_customs_new.db`. The MCP server and backend read and write only this file. `reset_db.py` restores it from the original.
- "Today" is `desk.date_today` = **2026-08-31**.

### Tables

| Table | Fields | Why it matters to the agents |
|---|---|---|
| `desk` | date_today, notes | The shop's clock. Every overdue / days-until-due check uses `date_today`, not the system date. |
| `tickets` | id, type, requester, subject, sku, size, qty, lease_id, invoice_id, status, notes, created_at | The work board. Boss reads `type` to route each ticket, and the optional `sku`/`lease_id`/`invoice_id` link it to the other tables. |
| `inventory` | sku, name, size, qty, location (PK sku+size) | Inventory checks stock by SKU **and** size to find shortfalls. |
| `pricing` | sku, unit_cost, list_price | Accounting's margin check: any discount must stay above `unit_cost`. Also prices restock POs. |
| `vendors` | id, name, specialty, lead_days | Inventory picks the restock vendor by `specialty` and quotes `lead_days` as the delivery time. |
| `invoices` | id, vendor_id, amount, due_date, status, description | Bills owed to vendors. An `open` invoice blocks that vendor from shipping, and past-due ones are overdue. |
| `leases` | id, space_name, landlord, monthly_rent, next_due, notes | Facilities' rent obligation. `next_due` gets advanced one month after rent is paid. |
| `cash_accounts` | name, balance, date | The only source of cash. The pay tool refuses any payment larger than `balance`, and cash only goes out. |
| `payments` | id, kind, ref_id, amount, account, paid_at, approved_by | The record of money out. It starts empty, and each row needs a human in `approved_by`. |

### Starting state (2026-08-31)

- **Cash:** `checking` = $3,400.
- **Vendors:** Bulldog Print Co (apparel reprint, 5 days), Elm City Gifts (mugs and small goods, 3 days), QuickShip CT (local courier, 1 day).
- **Invoice 501:** Bulldog Print Co, $840, due 2026-08-28, `open`. It is **3 days overdue**, and it blocks the only apparel vendor.
- **Lease 1:** Chapel Street shop, Elm City Properties, $2,400/month, next due 2026-09-02 (in 2 days).
- **Stock-outs:** CC-TEE-WHITE size S = 0, CC-MUG-CREST = 0.
- **Margins:** hoodie $58 / $22 cost, tee $28 / $8, cap $22 / $6, mug $14 / $3.50.

### The three open tickets and how they link

| Ticket | Type | Ask | Links | What it really involves |
|---|---|---|---|---|
| 101 | customer_order | Tauhid Zaman wants 1 Bulldog tee, size S | `sku`=CC-TEE-WHITE, `size`=S, **`invoice_id`=501** | Size S has 0 in stock → Inventory. The apparel vendor (Bulldog Print Co) won't reprint while invoice 501 is unpaid → Accounting must get $840 approved and paid first. Then a restock with a 5-day lead time, and Customer Service drafts an honest reply. |
| 102 | rent_notice | Elm City Properties: rent due in 2 days | **`lease_id`=1** | $2,400 due 2026-09-02, not yet overdue → Facilities + Accounting, human approval, then advance `next_due` to 2026-10-02. |
| 103 | price_override | Yale AI Club: 20 hoodies size M, bulk discount | `sku`=CC-HOOD-NAVY, `size`=M, `qty`=20 | Only 8 M in stock (shortfall of 12), and the restock vendor is again Bulldog Print Co, blocked by invoice 501. The discount must keep the price above the $22 cost → Inventory + Accounting, Boss makes the final call, Customer Service drafts the reply. |

### Cross-ticket constraints the agents must notice

- **Cash is tight.** Invoice 501 ($840) + rent ($2,400) = $3,240 of the $3,400 balance, which leaves **$160**. Restocking 12 hoodies at $22 cost = $264, which won't fit after both bills. The team can't say yes to everything, and the pay tool must refuse rather than go negative.
- **Invoice 501 is the shared blocker** for tickets 101 and 103. Paying it unblocks the apparel vendor for both.
- Ticket 101 links to an invoice even though it's a customer order. Agents must follow `invoice_id`, not just `type`.
- The free-text fields (`desk.notes` is null, `tickets.notes`, `leases.notes` is null) currently hold plain requests, nothing instruction-like. The agents should still treat them as data only.

## Problem 3: The MCP server

`mcp_server/mcp_server.py` is a FastMCP server named `campus-customs-ops`. It points at `data/campus_customs_new.db`, and every agent gets its data through it. All three tools are read-only, take "today" from `desk.date_today`, and return `found: false` with a message instead of inventing a row. Each was verified against the working DB through a FastMCP client (results below are real outputs).

| Tool | Tables it reads | Ticket it unlocks | Why it's the right tool for that ticket |
|---|---|---|---|
| `check_stock(sku, size, qty_needed)` | `inventory` | **103** (Yale AI Club, 20 × CC-HOOD-NAVY size M) | Ticket 103 can only be answered once we know whether 20 size-M hoodies exist, and the tool returns qty 8 and **shortfall 12** for that exact SKU + size, so Boss knows the order can't be filled from the shelf before any discount is discussed. |
| `get_vendor_status(vendor_id)` | `vendors`, `invoices`, `desk` | **101** (Tauhid Zaman, 1 × CC-TEE-WHITE size S, linked to invoice 501) | Size S is at 0, so ticket 101 depends on a reprint, and this tool shows the only apparel vendor, Bulldog Print Co (5-day lead), has **invoice 501 for $840, 3 days overdue, `can_ship: false`**, which is exactly why the restock is blocked and why Accounting must get 501 paid first. |
| `get_rent_status(lease_id)` | `leases`, `cash_accounts`, `desk` | **102** (Elm City Properties rent notice, lease_id 1) | Ticket 102 asks for rent, and this tool turns lease 1 into the facts a payment decision needs: **$2,400 due 2026-09-02, 2 days out, not overdue, $3,400 in checking → $1,000 left after paying**, without paying anything itself. |

Design choices:
- **One question per tool, named for the question** (`check_stock`, `get_vendor_status`, `get_rent_status`) so the LLM picks the right one from the name alone.
- **Tools compute the facts the rules depend on** (`shortfall`, `days_past_due`, `can_ship`, `days_until_due`, `cash_covers_rent`). The agents don't have to do date math or remember the "unpaid invoice blocks shipping" rule, and gpt-6-luna has less to get wrong.
- **No SKU→vendor mapping is invented.** The DB has none, so `get_vendor_status` returns every vendor's `specialty` and the agent matches apparel to "apparel reprint".
- **Reads before writes.** Paying invoice 501 or rent changes money, so those tools come later and will need human approval and a cash check.

## Problem 4: Connecting the MCP server to the vibe coder

`.mcp.json` at the project root registers `campus-customs-ops` as a stdio server for Claude Code. Every tool was then called live from Claude Code through MCP (not through a Python test script), and each output was checked against `data/campus_customs_new.db` with SQL. Evidence: `output/mcp_smoke.json`.

| Ticket | Tool call | Key output | Matches DB |
|---|---|---|---|
| 101 | `check_stock("CC-TEE-WHITE", "S", 1)` | qty 0, Aisle B, shortfall 1 | yes (`inventory`) |
| 101 | `get_vendor_status(1)` | Bulldog Print Co, 5-day lead, invoice 501 $840 open, 3 days past due, `can_ship: false` | yes (`vendors`, `invoices`, `desk`) |
| 102 | `get_rent_status(1)` | $2,400 due 2026-09-02, 2 days out, checking $3,400, $1,000 left after paying | yes (`leases`, `cash_accounts`, `desk`) |
| 103 | `check_stock("CC-HOOD-NAVY", "M", 20)` | qty 8, Aisle A, shortfall 12 | yes (`inventory`) |

## Problem 5: The agent team

Five PydanticAI agents in `backend/agents/`, one prompt each in `backend/prompts/`, data types in `backend/models.py`. Every agent runs on the one model named in `.env` (`OPENAI_MODEL`) through Portkey, via the Responses API. All shop facts come from the `campus-customs-ops` MCP server, which the backend starts over stdio (`backend/mcp_tools.py`). There is no second tools layer.

### Agents
| Agent | Job | MCP tools it can see | Output |
|---|---|---|---|
| **Boss** (`boss.py`, `prompts/boss.md`) | Reads each ticket, routes work, checks reports, makes the final call. The only agent that sets ticket status (a validator sends it back if it tries to finish without `update_ticket`). | list_open_tickets, get_ticket, update_ticket, get_cash_position, list_payment_requests, list_drafts | `TicketDecision` |
| **Inventory** (`inventory.py`) | Stock by SKU + size, shortfalls, other sizes, vendor match by specialty, `can_ship`, lead-time arrival estimates | get_ticket, check_stock, list_inventory, get_vendor_status | `SpecialistReport` |
| **Accounting** (`accounting.py`) | Cash, payment priority, invoices, pricing, 15% bulk-discount cap, margins. The only agent that files payment / purchase-order requests | get_ticket, get_cash_position, get_vendor_status, get_pricing, get_rent_status, request_payment, list_payment_requests | `SpecialistReport` |
| **Facilities** (`facilities.py`) | Verifies rent notices against the lease (landlord, amount, due date) and hands verified rent to Accounting | get_ticket, get_rent_status, get_cash_position, list_payment_requests | `SpecialistReport` |
| **Customer Service** (`customer_service.py`) | Writes customer/landlord drafts with a pre-save checklist (no vendor names, invoices, cash or unsupported dates). Never sends | get_ticket, get_pricing, save_customer_draft, list_drafts | `SpecialistReport` |

**Full connectivity.** Every agent has a `delegate(to_agent, task, reason)` tool that reaches all four others, so Facilities can hand rent straight to Accounting, or Inventory can ask Accounting for a purchase order. Delegation is orchestration, not shop data, so it lives in the backend (`agents/base.py`), not the MCP server.

**Agent loop and audit.** `run_agent()` drives each agent with `agent.iter()` node by node. Each node (user prompt, model request with tool results, model response with tool calls and tokens, end) is appended to `output/audit_trail.json`, along with `run_started`, `delegation_started/done/refused/failed` and `run_finished`. Every entry carries run id, ticket, agent, depth, delegation chain, step, model and the team's token use so far. The file is one JSON array that is only ever appended to (locked read-append-write plus atomic rename).

### MCP tools (15) and the tables they use
| Tool | Tables | Who gets it | New in P5 |
|---|---|---|---|
| `list_open_tickets` | tickets, desk | Boss | yes |
| `get_ticket` | tickets, invoices, leases, payment_requests, drafts, desk | all | yes |
| `update_ticket` | tickets (writes status + appended note), desk | Boss | yes |
| `check_stock` | inventory | Inventory | |
| `list_inventory` | inventory | Inventory | yes |
| `get_vendor_status` | vendors, invoices, desk | Inventory, Accounting | |
| `get_pricing` | pricing | Accounting, Customer Service | yes |
| `get_cash_position` | cash_accounts, leases, invoices, vendors, payment_requests, desk | Boss, Accounting, Facilities | yes |
| `get_rent_status` | leases, cash_accounts, payments, desk | Accounting, Facilities | (P8: + rent payments on file) |
| `request_payment` | payment_requests (writes), leases, invoices, vendors, inventory, pricing, cash_accounts | Accounting | yes |
| `list_payment_requests` | payment_requests | Boss, Accounting, Facilities | yes |
| `save_customer_draft` | drafts (writes), tickets | Customer Service | yes |
| `list_drafts` | drafts | Boss, Customer Service | yes |
| `approve_and_pay` | payments, invoices, leases, cash_accounts, payment_requests, vendors (writes) | **human only, no agent** | yes |
| `reject_payment_request` | payment_requests (writes) | **human only, no agent** | yes |

`payment_requests` and `drafts` are new tables that exist only in the working copy. `reset_db.py` creates them after copying the original.

### First full run (fresh DB, `python -m backend.run_ticket all --reset`)
| Ticket | Final status | What the team did |
|---|---|---|
| 101 tee S | waiting_approval | Stock 0, short 1. Spotted that open invoice 501 *is* the rush reprint of this tee, so it filed a request to pay 501 ($840) instead of a duplicate order. Draft tells the customer about a ~5-day lead once confirmed, with no vendor or invoice details. |
| 102 rent | waiting_approval | Facilities verified landlord, amount and due date against lease 1, then handed off to Accounting, which filed a $2,400 rent request (priority 1). |
| 103 20 hoodies M | blocked | 8 on hand, 12 short. A $264 restock doesn't fit: $3,400 − $2,400 rent − $840 invoice 501 = $160. No purchase order filed. Quoted the 15% cap ($49.30/unit, $986). Draft asks the club how to proceed. |

No payments were made (`payments` is still empty, cash still $3,400). Both payment requests wait for a human. Team usage per ticket: 10–16 model calls and 25k–47k input tokens.

## Safety: guardrails for real customers and real money

**Built in now**
- **Humans hold the money.** Agents can only file `request_payment`. `approve_and_pay` / `reject_payment_request` exist on the MCP server but are filtered out of every agent's toolset, and an `assert` in `mcp_tools.py` fails at startup if one leaks in.
- **Rules enforced in code, not just prompts.** Amounts come from the DB (an agent can't type a number). Payment refuses if cash would go negative, if the invoice isn't open, or if a restock vendor still has an unpaid invoice. Duplicate pending requests are refused. Rent payment advances `next_due` and invoice payment marks it paid, all in one transaction with `approved_by` required.
- **Least privilege.** Each agent sees only the tools its role needs. Customer Service can't see cash, and Inventory can't file payments.
- **Nothing leaves the building.** Customer messages are drafts addressed to the ticket's requester from the DB. No send tool exists, and the Outlook MCP is not connected.
- **Prompt-injection stance.** Ticket, lease and desk notes are data. Every prompt says to refuse and flag notes that ask to pay, skip approval or change a rule. Facilities checks the requester against the landlord on file.
- **No invented data.** Tools return `found: false` instead of guessing, and prompts require every number to come from a tool.
- **Audit trail.** Every loop step, tool call (with arguments and result) and hand-off is appended to `output/audit_trail.json`.

**What a real business would add**
- Named approvers with authentication, approval limits (e.g. two people over $1,000), and separation of duties so the requester can't also be the approver.
- A payee allow-list: pay only vendors and landlords already on file, with bank-detail changes verified out of band.
- Rate limits on drafts and requests per hour, plus alerts when an agent is refused or a run hits its budget.
- Personal-data handling: store only the customer data needed, redact it in logs, and set a retention period for the audit trail.
- Tamper-evident logs (write-once storage or hash-chained entries) and a reviewed sample of agent decisions each week.

**Token and loop limits**
- One shared `UsageLimits` per ticket across the whole team: 40 model requests, 60 tool calls, 250k tokens. When it trips, the run stops and the reason is logged.
- Delegation guards: no self-delegation, no delegating back up the chain (prevents A→B→A loops), max depth 3, max 8 hand-offs per ticket.
- Tools return computed facts (`shortfall`, `can_ship`, `payment_queue`, `within_policy`) so the model doesn't re-derive them, and audit entries clip long outputs to 1,500 chars.
- Stable instructions sit first in every request, so the provider can reuse the cached prefix. Prompts tell agents to stop once they can decide and not to re-check numbers they already have.

## Problem 7: Backend routes

Start from the `backend/` folder (venv active): `uvicorn main:app --reload --port 8000`. The API is then at http://localhost:8000, with interactive docs at `/docs`.

- `GET /api/tickets`: the live ticket board from the `tickets` table (description, real status, `is_resolved`, Boss notes, pending approval IDs, whether a run is in progress).
- `POST /api/tickets/{ticket_id}/run`: starts the Boss and its team on one ticket in the background and returns 202 + `run_id` (404 unknown ticket, 409 if already running or resolved).
- `GET /api/runs/{run_id}`: whether a run is running, finished or failed, plus the Boss's final decision.
- `GET /api/events`: agent activity from `output/audit_trail.json`, oldest first (messages, hand-offs, MCP tool calls and results, errors). Filter by `ticket_id` / `run_id` / `after_seq` / `limit`.
- `GET /api/approvals`: the payment and purchase-order requests the agents filed, optionally filtered by `status` or `ticket_id`.
- `POST /api/approvals/{approval_id}/approve`: a human approves one request with `{"approved_by": name}`. This is the only route that moves money (MCP `approve_and_pay`, one transaction). 409 if already processed or refused.
- `POST /api/approvals/{approval_id}/reject`: a human rejects a pending request with a reason. No money moves.
- `GET /api/cash`: the checking balance read from `cash_accounts` on every call, plus the total pending approval.
- `POST /api/reset`: development only. Restores the seeded DB via `reset_db.py` and appends a `reset` marker to the audit trail (events are never deleted).
- `GET /api/health`: liveness check, active runs and the allowed CORS origins.
- `GET /`: index listing the routes and the docs link.

---

# Final system documentation (Problem 9)

This section describes the system as built and verified in the Problem 9 end-to-end run. Where it differs from the per-problem notes above, this section wins.

## A. System architecture

```
 React dashboard (frontend/, :5173)
   │  fetch, JSON · polls 1.5s while running / 8s idle
   ▼
 FastAPI backend (backend/main.py, :8000)
   ├─ read-only SQLite queries (backend/db.py) ──────────────────────┐
   ├─ POST /run → background task → Boss agent (PydanticAI)          │
   │                 └─ delegate() ↔ Inventory · Accounting ·        │
   │                    Facilities · Customer Service (any ↔ any)    │
   │                 every agent: filtered MCP toolset (stdio)       │
   │                 every loop node → output/audit_trail.json        │
   └─ POST /approve → MCP approve_and_pay (human-only tool) ─┐      │
                                                              ▼      ▼
                    MCP server campus-customs-ops (mcp_server/mcp_server.py)
                                                              │
                                                              ▼
                                      SQLite data/campus_customs_new.db
```

- **Run flow:** the dashboard calls `POST /api/tickets/{id}/run`, which returns 202 with a `run_id`. The backend runs the Boss in an asyncio task. The Boss reads the ticket through MCP and delegates with `delegate(to_agent, task, reason)`. Each specialist runs its own PydanticAI loop with its own MCP tool slice. Reports flow back up the chain. The Boss records its call with `update_ticket`, which an output validator enforces, and returns a `TicketDecision`. The dashboard polls `/api/events?after_seq=` and `/api/tickets`.
- **Money flow:** an agent can only call `request_payment`, which writes a `payment_requests` row (pending). A person approves in the dashboard → `POST /api/approvals/{id}/approve` → the MCP tool `approve_and_pay`. That runs one SQLite transaction (`BEGIN IMMEDIATE`): insert into `payments`, mark the invoice paid or advance the lease's `next_due`, debit `cash_accounts`, and mark the request paid.
- **Model:** every agent uses the single model named in `.env` (`OPENAI_MODEL`) through Portkey, via `OpenAIResponsesModel`. Requests time out after 90s and are retried up to 2 times.

## B. Database tables (`data/campus_customs_new.db`)

| Table | Purpose | Key columns | Relationships |
|---|---|---|---|
| `desk` | The shop's "today" | `date_today` (2026-08-31), `notes` | — |
| `tickets` | The board | `id`, `type`, `requester`, `subject`, `sku`, `size`, `qty`, `lease_id`, `invoice_id`, **`status`** (`open / in_progress / waiting_approval / blocked / resolved`), `notes` (original request plus dated Boss notes), `created_at` | → `leases.id`, → `invoices.id` |
| `inventory` | Stock by SKU + size | PK (`sku`, `size`), `qty`, `location` | `sku` ↔ `pricing.sku` |
| `pricing` | Cost and list price | `sku` PK, `unit_cost`, `list_price` | — |
| `vendors` | Suppliers | `id`, `name`, `specialty`, `lead_days` | ← `invoices.vendor_id` |
| `invoices` | Vendor bills | `id`, `vendor_id`, `amount`, `due_date`, **`status`** (`open`/`paid`), `description` | → `vendors.id` |
| `leases` | The shop's space | `id`, `landlord`, `monthly_rent`, **`next_due`** (advances a month when rent is paid) | ← `tickets.lease_id` |
| `cash_accounts` | **Source of truth for cash** | `name` (`checking`), **`balance`**, `date` | — |
| `payments` | **Posted transactions only** | `id`, `kind` (`invoice`/`rent`/`purchase_order`), `ref_id`, `amount`, `account`, `paid_at`, **`approved_by`** | ← `payment_requests.payment_id` |
| `payment_requests`* | Agent proposals awaiting a human | `id`, `kind`, `ref_id`, `vendor_id`, `sku`/`size`/`qty` (POs), `amount` (always from the DB), `reason`, `ticket_id`, `requested_by`, **`status`** (`pending`/`paid`/`rejected`), `decided_by`, `decided_at`, `payment_id` | → `tickets`, → `payments` |
| `drafts`* | Customer/landlord messages, never sent | `id`, `ticket_id`, `recipient` (always the ticket's requester), `subject`, `body`, `created_by`, `status` | → `tickets` |

\* Created only in the working copy by `reset_db.py`. The original `data/campus_customs.db` is read-only and never opened.

## C. MCP tools (15, server `campus-customs-ops`)

| Tool | Purpose | Inputs | Output (main fields) | State | Agents |
|---|---|---|---|---|---|
| `list_open_tickets` | The board | — | `shop_date`, `tickets[]` | read | Boss |
| `get_ticket` | One ticket + links | `ticket_id` | ticket, `linked_invoice`, `linked_lease`, `payment_requests[]`, `drafts[]` | read | all five |
| `update_ticket` | Record the decision | `ticket_id`, `status`, `note`, `updated_by` | `ok`, `status`, `notes` | **writes** `tickets` | Boss |
| `check_stock` | Stock + shortfall | `sku`, `size`, `qty_needed=1` | `qty`, `location`, `shortfall`, `can_fill_from_stock` | read | Inventory |
| `list_inventory` | All sizes of a SKU | `sku=None` | `items[]`, `total_units` | read | Inventory |
| `get_vendor_status` | Vendor shipping status | `vendor_id=None` | per vendor `lead_days`, `open_invoices[]` with `days_past_due`, `can_ship` | read | Inventory, Accounting |
| `get_pricing` | Price, discount policy, margin | `sku`, `qty=1`, `discount_pct=0` | `unit_price`, `unit_margin`, `margin_pct`, `order_total`, `within_policy`, policy (10+ units, max 15%) | read | Accounting, Customer Service |
| `get_cash_position` | Cash vs. obligations in priority order | — | `total_cash`, `payment_queue[]` (rent ≤7 days → overdue invoices → other invoices → POs) with `fits`/`balance_after` | read | Boss, Accounting, Facilities |
| `get_rent_status` | Rent facts | `lease_id` | `monthly_rent`, `next_due`, `days_until_due`, `overdue`, `cash_after_rent`, `rent_payments_on_file`, `last_paid_due_date` | read | Accounting, Facilities |
| `request_payment` | Propose a payment | `kind`, `requested_by`, `reason`, `ref_id`, `ticket_id`, `vendor_id`, `sku`, `size`, `qty` | `request_id`, `amount` (from DB), `cash_after_if_approved`. Refuses duplicates | **writes** `payment_requests` (no money) | Accounting |
| `list_payment_requests` | What's pending | `status='pending'` | `requests[]`, `total_amount` | read | Boss, Accounting, Facilities |
| `save_customer_draft` | Save a message draft | `ticket_id`, `subject`, `body`, `created_by` | `draft_id`, `recipient` | **writes** `drafts` | Customer Service |
| `list_drafts` | Saved drafts | `ticket_id=None` | `drafts[]` | read | Boss, Customer Service |
| `approve_and_pay` | **Pay an approved request** | `request_id`, `approved_by` | `payment_id`, `balance_after`, invoice/lease change. Refuses: not pending, insufficient cash, invoice not open, vendor blocked | **writes** `payments`, `invoices`/`leases`, `cash_accounts`, `payment_requests` | **no agent (human, via API)** |
| `reject_payment_request` | Reject a request | `request_id`, `rejected_by`, `reason` | `status: rejected` | **writes** `payment_requests` | **no agent (human, via API)** |

## D. Five-agent architecture

| Agent | Responsibility | Output |
|---|---|---|
| **Boss** | Reads each ticket, chooses the minimum set of specialists, gives each a specific task with IDs and numbers, checks reports, makes the final call, and is the only one who sets status (`update_ticket`, enforced by an output validator). Resolution rules by ticket type; a cash shortfall is a final answer, not a reason to block. | `TicketDecision` |
| **Inventory** | Stock by SKU + size, shortfall, other sizes, vendor match by specialty, `can_ship`, lead-time estimates. Spots when an open invoice already covers the product. | `SpecialistReport` |
| **Accounting** | Cash priority (rent → overdue invoices → other invoices → restock), files payment/PO requests (never pays), discount policy (10+ units, ≤15%), margins. Files nothing that doesn't fit after higher priorities. | `SpecialistReport` |
| **Facilities** | Verifies rent notices against the lease (landlord, amount, due date, already paid?) and flags mismatches as possible fraud. | `SpecialistReport` |
| **Customer Service** | Drafts customer/landlord replies only, after a pre-save checklist (no vendor names, invoices, cash, margins or unsupported dates). | `SpecialistReport` |

- **Delegation:** every agent has `delegate(to_agent, task, reason)`, so any agent can reach any other (full connectivity). A specialist's structured report is returned to the caller as the tool result. Every agent in one ticket run shares one `RunUsage`.
- **Avoiding unnecessary delegation:** prompts route by ticket type and ask for one specific hand-off per specialist. Code-level guards refuse self-delegation, delegation back up the chain, depth > 3, and more than 8 hand-offs per ticket. Team budget per ticket: 40 model requests, 60 tool calls, 250k tokens. In Problem 9 no hand-off was refused or wasted: 101 used 3 specialists, 102 used 2, 103 used 3, and Facilities never ran on a non-rent ticket.

## E. Backend API (`backend/main.py`)

| Method | Endpoint | Purpose | Main params | Response | Errors / safety |
|---|---|---|---|---|---|
| GET | `/api/tickets` | Live board | — | `TicketOut[]`: status, `is_resolved`, description, Boss notes, `pending_approval_ids`, `draft_ids`, `running`, `last_run` (rebuilt from the audit trail) | 503 if DB unavailable |
| POST | `/api/tickets/{ticket_id}/run` | Start the team | path `ticket_id` | **202** `{run_id, status:"running", events_url}` | 404 unknown, 409 running or resolved |
| GET | `/api/runs/{run_id}` | Run status/result | path | `running/finished/failed`, decision | 404 (in-memory per server session) |
| GET | `/api/events` | Agent activity | `ticket_id`, `run_id`, `after_seq`, `limit≤1000`, `include_before_reset` | `EventOut[]` (seq, ts, run, ticket, agent, depth, event, summary, detail), oldest first | — |
| GET | `/api/approvals` | Requests the agents filed | `status`, `ticket_id` | `ApprovalOut[]` incl. `payee`, `description` | 422 bad status |
| POST | `/api/approvals/{id}/approve` | **Human approval: the only route that moves money** | body `{approved_by}` | `{approval, payment, cash}` | 404 missing, 409 already processed or refused (cash/vendor), 422 no name. Serialized by a lock plus `BEGIN IMMEDIATE` |
| POST | `/api/approvals/{id}/reject` | Human rejection | body `{rejected_by, reason}` | `ApprovalOut` | 404 / 409 |
| GET | `/api/cash` | Checking balance from `cash_accounts` | — | `account`, `balance`, `as_of`, `pending_approvals_total`, `balance_if_all_pending_approved`, `currency: null` (not stored) | 503 |
| POST | `/api/reset` | Restore the seeded DB | — | statuses, cash, counts, `events_marker_seq` | **403 when `APP_ENV=production`**, 409 while a run is active |
| GET | `/api/health`, `/` | Liveness and index | — | `reset_enabled`, `last_reset_seq`, active runs, CORS origins | — |

CORS allows only `FRONTEND_URL`, `http://localhost:5173` and `http://127.0.0.1:5173`, with methods GET/POST.

## F. React dashboard (`frontend/`)

- **Structure:** `src/lib` holds `api.ts` (typed fetch client, `VITE_API_BASE_URL`), `types.ts` (mirrors `backend/models.py`), `useDesk.ts` (polling, incremental events by `after_seq`, dedupe by `seq`), `feed.ts` (events → timeline + per-agent review) and `status.ts` (desk state). `src/components` holds the queue, workspace, timeline, run review, finance panel, reset dialog and toasts.
- **Capabilities:**
  - Select a ticket (URL keeps `#ticket-N`) and press **Run Agent Team**, which has a synchronous double-click guard.
  - Live timeline with indented delegation lanes and `MCP` call/result rows.
  - "Who did what" cards per participating agent.
  - States: Open, Running, Awaiting approval, Approved · re-run to close, Blocked, Failed, Resolved.
  - Approval vouchers with payee, purpose, requesting agent, and "now → after" projection. Two-step approve with the approver's name, or reject with a reason.
  - Checking balance straight from the API, plus a ledger of posted payments.
  - Reset in the "⋯" menu (dev only, confirmation dialog).
- **Communication:** JSON over `fetch` to FastAPI. Polls every 1.5s while any ticket runs, 8s idle. Never computes balances or statuses itself.

## G. Safety rules

1. **Agents cannot pay.** Their only money tool is `request_payment`. `approve_and_pay` / `reject_payment_request` are filtered out of every agent, and startup asserts this.
2. **Every transaction needs explicit human approval** with a named approver. In Problem 9 both payments were approved by the user in the dashboard. Claude did not click approve.
3. **No duplicate payments.** Duplicate pending requests are refused. Approval locks the DB before checking status, so a second approval gets 409. A test fires 5 at once and exactly 1 succeeds.
4. **The database is the source of truth.** The dashboard shows API values only. Amounts come from DB rows, never from agent text. Reconciliation uses posted `payments` only.
5. **Resolution requires verified criteria.** Only the Boss sets status, and only after the money it needed is paid (or none was needed) and the customer draft reflects the decision. The dashboard never turns a ticket green because an HTTP call succeeded.
6. **MCP activity is auditable.** Every loop node, tool call (args + clipped result), hand-off, approval, reset and failure is appended to `output/audit_trail.json` with run id, ticket and seq. The file is never rewritten from scratch.
7. **Reset is deliberate and dev-only.** A confirm dialog, 403 in production, 409 during runs, and no reset on startup.
8. **No secrets in logs.** Keys stay in `.env` (git-ignored). The audit trail and repo were scanned for `.env` values: none found.
9. **Errors are reported, not hidden.** Interrupted and failed runs are recorded (`run_interrupted`, `run_finished ok:false`) and shown as such in the dashboard.

## H. Execution and verification

1. **Backend:** `cd backend && source ../.venv/bin/activate && uvicorn main:app --reload --port 8000`. Restart it after editing `mcp_server/` or `backend/prompts/`.
2. **Frontend:** `cd frontend && npm install && npm run dev`, then open http://localhost:5173.
3. **Reset:** dashboard "⋯" → *Reset demo…* → confirm (or `POST /api/reset`, or `.venv/bin/python reset_db.py`). Verify: `sqlite3 data/campus_customs_new.db "select id,status from tickets; select balance from cash_accounts"`.
4. **Execute:** select 101 → Run Agent Team. Repeat for 102 and 103, in order.
5. **Monitor:** watch the Activity feed, or `GET /api/events?ticket_id=101`.
6. **Approve:** in *Needs your decision* → Approve → your name → Confirm payment. Then re-run the ticket so the Boss can close it.
7. **Verify resolution:** the `tickets.status` column, and payments/requests in SQLite.
8. **Reconcile:** starting balance − Σ `payments.amount` = `cash_accounts.balance` (see the Cash tab in `desk_tickets.html`).
9. **Artifacts:** `output/desk_tickets.html`, `output/resolved_tickets.json`, `output/resolved_board.html`, `output/audit_trail.json`.

**Problem 9 result:** all three tickets resolved. Checking went from $3,400.00 to $160.00 (−$840.00 invoice 501, −$2,400.00 rent, $0.00 for 103), with a reconciliation difference of $0.00.

**Known limitations:**
- Run status in `/api/runs` is in-memory per server session. The durable record is the audit trail.
- No authentication: `approved_by` is whatever name the dashboard sends.
- Closing a ticket after approval takes a second run.
- `currency` is not stored.
- In Problem 9, two model calls failed at the gateway: one hung until the new timeout fix, and one returned connection errors after the Boss had already recorded its decision. Neither lost data, and both are documented.
- Agents re-read the ticket in every specialist, so tool-call counts ran 2–3× the plan.
- Model latency is uneven: most calls take 3–11s, but the Boss occasionally needs 60–90s on its final step. Requests time out at 90s and are retried twice.
- Tests run against a throwaway DB (`CC_WORKING_DB`), so `pytest` never disturbs the graded data: 13 offline tests plus 1 live agent test pass.
