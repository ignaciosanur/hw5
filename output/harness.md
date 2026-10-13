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
