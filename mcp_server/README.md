# Campus Customs MCP Server

`mcp_server.py` is a FastMCP server named **`campus-customs-ops`**. It is the shared tool belt for the whole agent team: Boss, Inventory, Accounting, Facilities and Customer Service get all shop data through these tools instead of touching SQLite directly. Every answer comes from the database. If a row doesn't exist, the tool says so rather than guessing.

## Database
- Uses **`data/campus_customs_new.db`** (the working copy, resolved relative to the project root).
- The original `data/campus_customs.db` is never opened. Run `python reset_db.py` from the project root to restore the working copy. Reset also creates the two working-copy-only tables, `payment_requests` and `drafts`.
- "Today" is `desk.date_today`, not the computer's clock, so overdue math matches the shop.
- Shop policy constants at the top of the file: max bulk discount 15% for orders of 10+ units, and rent due within 7 days goes first in the payment queue.

## Tools (15)
| Tool | Reads / writes | What it does |
|---|---|---|
| `list_open_tickets()` | tickets | Every unresolved ticket, oldest first. |
| `get_ticket(ticket_id)` | tickets, invoices, leases, payment_requests, drafts | One ticket plus its linked invoice, lease, payment requests and drafts. |
| `update_ticket(ticket_id, status, note, updated_by)` | **writes** tickets | Sets status (`open`, `in_progress`, `waiting_approval`, `blocked`, `resolved`) and appends a dated note. |
| `check_stock(sku, size, qty_needed=1)` | inventory | On-hand qty and location for one SKU + size, and the shortfall. |
| `list_inventory(sku=None)` | inventory | Every size of a SKU (or the whole shop), for alternatives. |
| `get_vendor_status(vendor_id=None)` | vendors, invoices | Specialty, lead time, open invoices with days past due, and `can_ship` (False while any invoice is unpaid). |
| `get_pricing(sku, qty=1, discount_pct=0)` | pricing | Cost, list price, discount cap for that qty, `within_policy`, unit and order margin. |
| `get_cash_position()` | cash_accounts, leases, invoices, payment_requests | Cash vs. everything that wants it, in priority order (rent → overdue invoices → other invoices → restock), with the running balance. |
| `get_rent_status(lease_id)` | leases, cash_accounts, payments | Rent amount, landlord, next due date, days until due / overdue, whether cash covers it, plus rent payments already on file and the due date they paid. |
| `request_payment(kind, requested_by, reason, ...)` | **writes** payment_requests | Files a rent, invoice or purchase-order payment **for human approval**. The amount comes from the DB. Duplicates are refused. Moves no money. |
| `list_payment_requests(status="pending")` | payment_requests | What is waiting for a human (or all requests). |
| `save_customer_draft(ticket_id, subject, body, created_by)` | **writes** drafts | Saves a message draft to the ticket's requester. Never sent. |
| `list_drafts(ticket_id=None)` | drafts | Saved drafts. |
| `approve_and_pay(request_id, approved_by)` | **writes** payments, invoices, leases, cash_accounts, payment_requests | **Human only. Never given to an agent.** Refuses if cash is insufficient, the invoice isn't open, or a restock vendor has an unpaid invoice. Otherwise, in one transaction: inserts into `payments` with `approved_by`, marks the invoice paid or advances the lease's `next_due` one month, and debits cash. |
| `reject_payment_request(request_id, rejected_by, reason)` | **writes** payment_requests | **Human only.** Rejects a pending request. No money moves. |

The backend gives each agent a filtered slice of these tools (see `backend/mcp_tools.py`). The two human-only tools are in no agent's slice.

## Run
```bash
.venv/bin/python mcp_server/mcp_server.py   # stdio MCP server
```

## Connect to the vibe coder
The project-root `.mcp.json` registers this server for Claude Code as a stdio server named `campus-customs-ops` (command: the project's `.venv/bin/python`, arg: `mcp_server/mcp_server.py`). Opening the project in Claude Code loads it, and the tools appear as `mcp__campus-customs-ops__<tool>`. The Problem 4 test calls and their outputs are in `output/mcp_smoke.json`.
