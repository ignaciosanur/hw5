# Campus Customs Ops Desk: design notes

The dashboard (`frontend/`, React + Vite + TypeScript) is the human side of the agent team. It has to answer three questions at a glance: **what needs attention, what the agents are doing, and what only a person can decide.** Every number and event on screen comes from the FastAPI backend (`backend/main.py`), which reads the working SQLite DB and the append-only `output/audit_trail.json`. The frontend never computes a balance or a status it can't trace back to the backend.

## Layout

Three columns, read left to right like a desk: **inbox → work → money.**

| Column | Content | Why it sits there |
|---|---|---|
| Left, 290px | **Ticket queue** (#101–#103) | It's the inbox, so it stays put while you work. A colored spine and status pill on each card let you scan the whole queue without opening tickets. |
| Center, flexible | **Ticket brief → outcome → activity feed** | The agents' work needs the most width. The brief (what was asked, the Run button) sits on top. The Boss's verdict and "who did what" come next, once a run ends. The live timeline is at the bottom. |
| Right, 370px | **Checking balance → "Needs your decision" → Ledger** | Money gets its own column so it is never buried in agent chatter, and approvals stay visible whichever ticket you're reading. The balance sits on top because every approval is judged against it. |

Each column scrolls on its own, so you can read a long feed while the balance and the pending approval stay in view. Below 1060px the page becomes one scrolling document: the queue stays as a slim sticky column, and the cash and approvals move *above* the activity, because a human decision outranks reading history.

## Agent identities

Each agent has a fixed color, an icon and a name, used the same way in the feed, the "On the job" strip and the contribution cards:

| Agent | Color | Icon | Shape |
|---|---|---|---|
| **Boss** | Yale navy | crown | **filled square seal** (the only filled, square avatar) |
| Inventory | teal | package | tinted circle |
| Accounting | ledger green | calculator | tinted circle |
| Facilities | brick | building | tinted circle |
| Customer Service | plum | speech bubble | tinted circle |
| You (human approver) | charcoal | person | **dashed outline** |

- **The Boss looks different in shape, not only color,** so the coordinator stands out even for color-blind users. Boss rows also have slightly larger avatars.
- **Delegation shows as indentation.** When the Boss hands work to Accounting, Accounting's steps are indented one level with a thin lane in Accounting's color. If Facilities then hands off to Accounting, that sits one level deeper. You can see who asked whom from the shape of the feed.
- **MCP tool calls look like terminal lines, not speech.** They sit in a dashed, monospaced box with a dark `MCP` tag: `→ check_stock(sku="CC-HOOD-NAVY", size="M", qty_needed=20)` on top and `↵ 8 on hand (Aisle A) · need 20 · short 12` underneath. Clicking the box shows the raw arguments and result JSON. An agent *saying* something and an agent *touching the database* never look alike.
- **Only participating agents appear.** The "Worked on this ticket" strip and the "Who did what" cards come from the run's actual events. Ticket 102 shows Boss, Facilities and Accounting. Ticket 103 shows Boss, Inventory, Accounting and Customer Service. Nobody is listed by default.

## Ticket states

`tickets.status` in the DB holds `open / in_progress / waiting_approval / blocked / resolved`. The run record (`last_run`, rebuilt from the audit trail so it survives restarts) adds running and failed. The desk shows one state per ticket, chosen in this priority order:

| State | When | Treatment |
|---|---|---|
| **Running** | a run is in flight | navy pill with a spinner, pulsing card spine, a light sweep across the top of the workspace, "On the job" strip with the active agent's avatar ringing, elapsed timer, `live` badge on the feed |
| **Resolved** | the Boss set `resolved` | green pill that lands with a short "stamp" animation. The Run button locks, and the queue card dims its title and keeps the outcome line |
| **Failed** | the last run errored or was interrupted | red pill, an error banner that says nothing was marked resolved, and the button becomes **Retry agent team** |
| **Awaiting approval** | a payment for this ticket is pending | amber pill, an amber "● needs you" dot in the queue, and a banner in the brief that jumps to the approval card |
| **Approved · re-run to close** | every request has been decided but the Boss hasn't closed the ticket yet | teal pill. The button says **Run agent team again**. This avoids showing "awaiting approval" when nothing is waiting, and avoids calling it resolved before the Boss says so |
| **Blocked** / **In progress** / **Open** | straight from the DB | rust / steel / slate pills |

A ticket is **never** shown as resolved just because an HTTP call succeeded. Only the Boss's `update_ticket(..., "resolved")`, read back from the DB, turns a ticket green.

## Cash and approvals

- **The balance is a bank card, not a stat tile.** A big monospaced number on navy, labeled with its source (`cash_accounts`) and the shop date. It shows only what `GET /api/cash` returns. If pending requests exist, a second line shows "$X waiting for approval → $Y if all approved", which is a projection, clearly labeled.
- **Approval cards look like vouchers.** A perforated top edge, the amount in large monospace, the payee and description from the DB (joined from `vendors` / `leases` / `invoices`), the requesting agent's avatar with its own reason in quotes, and a two-cell projection: "Checking now" vs "After approval". If the payment would overdraw the account, the projection turns red and confirmation is disabled. The backend would refuse it anyway.
- **Approving takes two deliberate steps.** "Approve" opens an inline confirmation that names the amount, payee and account, and asks for your name (recorded as `approved_by`). It also re-fetches the balance first, so the projection uses the latest number. While the request is processing, the button is disabled and shows "Processing…". On success the panel refreshes everything from the backend: the balance briefly flashes as it drops, the voucher moves to the Ledger, and a toast confirms the payment ID. On failure (insufficient cash, already processed, vendor blocked, backend down) the message is shown inline and *nothing* is marked paid.
- **The ledger is the record of completed decisions only.** Paid rows show `−$amount`, payment ID and approver. Rejected rows say "rejected" with the reason. Pending requests never appear there.

## Interaction design

- **Polling that matches the work.** The backend exposes no SSE or WebSockets, so the desk polls: every **1.5s while any ticket is running**, every **8s when idle** (enough to notice changes from another tab or the CLI). Events are fetched incrementally with `after_seq`, merged by their `seq` ID (no duplicates, always in order). Board data only re-renders when the JSON actually changed.
- **No double runs.** The Run button is locked synchronously on the first click, before React re-renders, and stays disabled while the ticket runs. The backend's 409 is a second guard, and its message is shown if it ever fires.
- **Reset is out of the way on purpose.** It lives in the "⋯" menu, is labeled "Dev only", is hidden when the backend reports `reset_enabled: false`, and opens a confirmation dialog listing exactly what will be cleared. The desk never resets on load. If a reset happens elsewhere (tests, CLI, another tab), the desk notices from `last_reset_seq` and drops its cached feed.
- **Honest failure states.** If the API is unreachable, a red banner says so, gives the exact start command, greys out the desk as "last known values", and disables every action. Empty states explain what will appear and why ("Press Run Agent Team. The Boss reads ticket #101…"). An error boundary catches display bugs without touching data.
- **Keyboard and focus.** The tickets are real buttons (↑/↓ moves between them), every action has a text label, focus rings are visible, the reset dialog is a native modal (`Esc` cancels), and live regions announce balance changes and toasts. Animations respect `prefers-reduced-motion`.
- **Refresh-proof.** The selected ticket lives in the URL (`#ticket-102`). Statuses, approvals, balance and the last run's outcome all come back from the backend after a reload.

## Creative decisions

1. **The voucher metaphor for approvals.** A perforated edge and big monospace amount make a pending payment feel like a physical cheque waiting for a signature, which is exactly the moment the human matters. Putting "Checking now → After approval" right on the voucher means you never approve without seeing the consequence.
2. **Delegation as indented lanes.** Instead of a flat log, the feed nests each hand-off one level deeper with a colored lane. The Boss → Facilities → Accounting chain on the rent ticket reads as a little org chart in motion, which helps you trust (or question) the routing.
3. **"MCP" terminal lines vs. agent speech.** Tool calls render as monospaced call/return pairs with a dark `MCP` tag. You can tell at a glance when an agent is *thinking out loud* and when it is *reading or writing the books*, and one click shows the raw JSON.
4. **A Campus Customs identity, not a template.** Yale navy, a "CC" seal, IBM Plex Serif for ticket titles and the customer's own words (set as a quotation), Plex Mono for money and tools, on a warm ledger-paper background. It reads like a New Haven shop's back office, not a generic AI console.
5. **"Approved · re-run to close" as its own state.** Most dashboards jump straight from "awaiting approval" to "done". Here the human approves the money, but the Boss still makes the final call, and the desk is honest about that gap.

## Backend additions made for the dashboard (all read-only or safety-neutral)

- `GET /api/tickets` now includes `last_run` (latest run since the last reset, rebuilt from the audit trail: running / finished / failed / interrupted, with the Boss's decision or the error), so states survive server restarts and browser refreshes.
- `GET /api/approvals` rows include `payee` and `description`, joined from `vendors`, `leases` and `invoices`.
- `GET /api/health` reports `reset_enabled` and `last_reset_seq`.
- Specialist reports and agent outputs are stored whole (structured) in the audit trail instead of being clipped to 1,500 characters, so "who did what" can read them.
- The MCP tool `get_rent_status` also lists rent payments on file and `last_paid_due_date`. Without it, a re-run after paying rent saw the lease's next due date move forward and wrongly flagged a "discrepancy". The Boss and Facilities prompts now say when a rent notice counts as resolved.

Money still moves only through `POST /api/approvals/{id}/approve` → MCP `approve_and_pay`.
