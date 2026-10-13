# AI Prompts

## Problem 1: Vibe Coder Prompts

### Initial prompt

> Problem 1: vibe coder prompts
>
> Create AI_prompts.md at the start of the assignment and keep it updated as you work. this file is the log of what you typed to your vibe coder.
>
> Put one section for each problem. Each section must include:
>
> * the problem number and title
> * at least one prompt we typed
> * one follow-up prompts if it was needed (and one sentece on what was lcking after the first)

## Problem 2: Study the Campus Customs Database

### Initial prompt

> Problem 2: Study the Campus Customs database
>
> Open data/campus_customs.db and look through every table and its fields. Copy the original file to data/campus_customs_new.db --later problems update that working copy. Study the three open tickets so you see how they limk to other tables
>
> Start ouput/harness.md . for each table, lsit the fields and one short line on why that table matters for the agents. We will keep growing the harness file in later pobrlems

## Problem 3: Build the MCP Server

### Initial prompt

> For the next problem, read lectures 8 to 10 and learn applicable tools/tricks or packages that you can leverage
> https://zlisto.github.io/mgt_409_fa26/lectures.html
>
> Problem 3: Build the MCP server
>
> Write an MCP server in mcp_server/ using FastMCP. It will talk to data/campus_customs_new.db You do not need to ocnnect or run it in this problem. Every agent in this homework uses the tools in this MCP server. You will add more tools to it later; for now write three tools you know you will need for the tickets in the database. Keep the names clear. Never invent any data, only use information from the database.
>
> In output/harness.md, list each of your three MCP tools. For every tool include: which table it reads, which ticket it helps unlock (101, 102, or 103), and one sentence on why that tool is the right one for that ticket. Vague lines like 'reads inventory" score low, we need to tie the tool to the ticket.
>
> Also add a short mcp_server/README.md file that explains what the MCP server is for, which database file it uses, and three tools it has

## Problem 4: Connect the MCP Server to the Vibe Coder and Test Each Tool

### Initial prompt

> Problem 4: add the MCP server to vibe coder and test each tool
>
> In this session, I want you to add the MCP server to this project so the vibe coder can call the tools. Save the connection JSON text in .mcp.json at the project root (or however the vibe coder is saving local MCP server lists).
>
> With the vibe coder connected, test each of the three MCP tools. Save the evidence in output/mcp_smoke.json. For every tool, include:
> -the prompt I asked the vibe coder
> -the tool name
> -the tool output (must match alues in data/campus_customs_new.db

### Follow-up prompt (tool test: `check_stock`)

> Using the `campus-customs-ops` MCP tools, check the current inventory of Basic Hoodies (SKU: CC-HOOD-NAVY), size M. Compare available stock against the Yale AI Club's order of 20 units. Report the quantity available, the inventory shortfall (if any), and whether the order can be fulfilled in full.

What was lacking after the first prompt: the first test round used prompts the vibe coder wrote itself, so the evidence in `output/mcp_smoke.json` didn't show a tool test prompt actually typed by the user.

### Follow-up prompt (tool test: `get_vendor_status`)

> Using the `campus-customs-ops` MCP tools, identify which vendors are currently eligible to ship orders. Specifically, verify whether Bulldog Print Co has any outstanding unpaid invoices that prevent shipment. List each vendor's shipping eligibility and, where applicable, the reason for any restrictions.

What was lacking after the first prompt: the earlier vendor test only checked Bulldog Print Co, so it didn't show that the other two vendors are free to ship.

### Follow-up prompt (tool test: `get_rent_status`)

> Using the `campus-customs-ops` MCP tools, retrieve the current payment status of Lease 1, including the rent amount, next due date, and any outstanding balance. Compare the amount due against the company's available cash balance. Report whether sufficient cash is available to cover the payment and calculate any surplus or shortfall.

What was lacking after the first prompt: the rent test prompt had been written by the vibe coder, not typed by the user.

## Problem 5: Build the Agent Team and Grow the MCP Tools

### Initial prompt

> Problem 5: Build the agent team and grow the MCP tools
>
> Build the agentic team for Campus Customs using PydanticAI: Booss, Inventory, Accounting, Facilities, and Customer Service. Include prompts, models, and agent loops so they can delegate work to each other with full connectivity
>
> Put the agent prompts in backend/prompts/ --one file per agent. Put data types in backend/models.py, and the agent files under backend/ (your layout can vary as long as the five roles are clear). Use your PORTKEY_API_KEY and only gtp-6-lune for every agent.
>
> Write each prompts in your own words with the shop rules that agent needs. More detailed prompts that cover all aspects of an agent's work and scope score higher than a short generic prompts.
>
> Add any tools the agents need to your MCP server so they can work on the open tickets. Shop facts come from the MCP server over data/campus_customs_new.db --do not invent a second shop-tools layer that bypasses MCP.
>
> Wire the agents so they append to output/audit_trail.json as they run: for each agent-loop step, record enough to audit later. Append to this file - do not wipe it each run.
>
> IN output/harness.md, list each agent and each MCP tool (including ones you add in this problem) along with which table the tool uses. Also add a short safety section: the guardrails a real business would want when agents touch real customers and real money, plus limits that keep token use in check.
>
> Update mcp_server/README.md so the tool list matches what you have now.
>
>
> BEFORE YOU IMPLEMENT. let's debate this prompt. Do you need more information? Is there something that you would suggest based on what we learned in class (rememebr how you saw the slides?)

### Follow-up prompt

> I'm aligned with this.
>
> 1. Ok to do new tables
> 2. Disount policy use the maximum bulk discount
> 3. Cash priority, aligned with rent, then overdue, then restock
> 4. Scope of the problem: aligned with doing the backend

What was lacking after the first prompt: it left open where pending payments and customer drafts are stored, what discount rule applies to ticket 103, how to rank bills when cash can't cover everything, and whether to build an API now or only the backend agents.

### What we worked out before building

- Model is read from `.env` (`OPENAI_MODEL`) and run through the Responses API, because the course's model rejects function tools over chat/completions (found in Lecture 11).
- Agents can only *request* a payment; the tool that actually pays is human-only and never given to an agent, and it refuses if cash would go negative.
- Each agent sees only the MCP tools its role needs, and delegation has a depth cap, a per-ticket cap and no calls back up the chain, so full connectivity can't loop.
- Two new tables (`payment_requests`, `drafts`) live only in the working DB; discount policy is a capped bulk discount; cash priority is rent, then overdue invoices, then restock.
- After the first full run, the owner confirmed a 15% cap on bulk discounts, with bulk meaning 10+ units in what is actually sold, so a partial fill of 8 hoodies gets no discount.

## Problem 6: Plan the Three Tickets

### Initial prompt

> Problem 6: Plan the Three Tickets
> Before implementing or connecting the backend, develop an execution plan for each of the three open tickets (101, 102, and 103).
> 1. Create the HTML Deliverable
> Create a standalone HTML file at `output/desk_tickets.html` that can be opened directly in a browser without requiring a server.
> The page must contain five tabs:
>
> * Ticket 101
> * Ticket 102
> * Ticket 103
> * Cash
> * Reflection
>
> Leave the Cash and Reflection tabs empty or include a brief "Coming later" placeholder. Do not populate them yet.
> 2. Document the Expected Execution Plan
> For each ticket, create two clearly labeled sections:
>
> * Expected: Populate this section with your proposed execution plan.
> * Actual: Leave this section empty for now. It will be completed after the agents execute the tickets.
>
> Each Expected section must address the following:
>
> 1. Initial action: Identify which specialist agent the Boss should contact first and explain why this is the appropriate starting point.
> 2. Agent delegations: Specify which additional specialist agents should be involved, what each should accomplish, and the logical sequence of delegation. Do not assume every agent needs to participate.
> 3. MCP tool usage: Identify the specific MCP tools or tool operations expected for each delegation, explaining what information or action each tool should provide.
>
> 3. Planning Guidelines
>
> * Review the details and requirements of each ticket before developing its execution plan.
> * Tailor delegations to the specific ticket. Do not assign every specialist to every ticket.
> * Use the minimum number of agents and MCP tool calls necessary to resolve each ticket effectively.
> * Distinguish between required delegations and optional steps that depend on earlier findings.
> * Base the plan on available ticket information and actual agent/tool capabilities. Do not invent tools, agents, or ticket details.
> * Write the plan in clear, concise language, focusing on the expected sequence of actions rather than generic descriptions of agent responsibilities.
> * Do not execute the tickets, invoke operational agents, or modify backend data at this stage. This task is strictly a planning exercise.
>
> 4. Final Validation
> Before completing the task, verify that:
>
> * `output/desk_tickets.html` exists and opens correctly in a browser.
> * All five tabs are present and functional.
> * Tickets 101, 102, and 103 each contain a complete Expected section.
> * Each Expected section identifies the first agent, subsequent delegations, and anticipated MCP tool usage.
> * Every Actual section remains empty.
> * The Cash and Reflection tabs remain unpopulated.
> * No tickets have been executed or operational data modified.
>
> Final deliverable: `output/desk_tickets.html`
> The objective is to establish a clear, efficient, ticket-specific execution baseline that can later be compared against the agents' actual behavior.

## Problem 7: Backend Routes

### Initial prompt

> Problem 7: Backend Routes
> Objective
> Build a FastAPI backend that connects the agent system, ticket database, and financial operations to the React dashboard developed in the next problem.
> Implement the required API routes in `backend/main.py`, ensuring the frontend can retrieve ticket information, execute agent workflows, monitor agent activity, approve financial transactions, and reset the application state.
> 1. Required API Endpoints
> Implement the following six capabilities using RESTful endpoints.
> A. Retrieve Tickets
> `GET /api/tickets`
>
> * Return tickets 101, 102, and 103.
> * Include each ticket's ID, description, and current status (`open` or `resolved`).
> * Retrieve the latest status from the database rather than hardcoding it.
> * Return a consistent JSON structure suitable for the React frontend.
>
> B. Execute a Ticket
> `POST /api/tickets/{ticket_id}/run`
>
> * Accept a valid ticket ID.
> * Trigger the existing multi-agent workflow for that ticket.
> * Allow the Boss agent to delegate tasks to the appropriate specialists based on the ticket's requirements.
> * Record agent actions, tool calls, and execution results.
> * Update ticket status only when the resolution criteria are satisfied.
> * Prevent duplicate or concurrent execution of the same ticket.
> * Return the execution status and a reference to the run.
>
> C. Retrieve Agent Events
> `GET /api/events`
>
> * Return recent agent activity in chronological order.
> * Include the ticket ID, run ID, agent name, timestamp, event type, and event details.
> * Capture agent messages, delegations, MCP tool calls, tool results, and errors where available.
> * Support optional filtering by ticket ID and a configurable event limit.
> * Ensure the frontend can poll this endpoint to refresh the activity feed without reloading the page.
>
> D. Approve Payments and Purchases
> `POST /api/approvals/{approval_id}/approve`
>
> * Implement a human-in-the-loop approval mechanism for financial transactions.
> * Agents may prepare or propose payments and purchases, but must never execute them independently.
> * Only this endpoint may authorize and apply approved financial changes.
> * Validate that the approval exists, is pending, and has not already been processed.
> * Apply the corresponding financial transaction and update the checking balance atomically.
> * Record the approval decision and resulting transaction.
> * Prevent duplicate payments if the endpoint is called more than once.
> * Return the approval result and updated financial information.
>
> E. Retrieve Checking Balance
> `GET /api/cash`
>
> * Query the `cash_accounts` table.
> * Return the current checking account balance.
> * Include the account identifier and currency if available.
> * Reflect approved transactions immediately.
> * Never use hardcoded or cached balances as the source of truth.
>
> F. Reset Application State
> `POST /api/reset`
>
> * Restore the database to its original seeded state.
> * Reset ticket statuses, agent events, pending approvals, financial transactions, and checking balances as applicable.
> * Use the project's existing seed or reset mechanism whenever possible.
> * Ensure repeated resets produce the same initial state.
> * Return a confirmation and summary of the restored state.
> * Treat this as a development-only operation. Do not expose an unrestricted destructive reset in production.
>
> 2. Implementation Requirements
> Project integration
>
> * Inspect the existing project structure, database schema, agent definitions, and MCP integrations before implementing the routes.
> * Reuse existing services, database connections, and agent orchestration functions.
> * Do not duplicate business logic or create mock agents when working implementations already exist.
> * Preserve compatibility with the project's existing architecture and dependencies.
>
> API design
>
> * Use FastAPI and Pydantic models for request and response validation.
> * Return consistent JSON responses with appropriate HTTP status codes.
> * Handle invalid ticket IDs, missing approvals, duplicate requests, database failures, and agent execution errors gracefully.
> * Configure CORS for the React development frontend using explicit allowed origins.
> * Ensure blocking agent workflows do not freeze unrelated API requests.
>
> Agent execution and observability
>
> * Preserve the Boss agent's responsibility for selecting and delegating to specialist agents.
> * Record meaningful execution events so the React dashboard can display what each agent did, which MCP tools were called, and the results.
> * Keep event records associated with the correct ticket and execution run.
> * Ensure failures are observable without falsely marking tickets as resolved.
>
> Financial integrity
>
> * Enforce a strict separation between proposing and executing financial transactions.
> * Never deduct cash when an agent merely proposes a payment or purchase.
> * Require an explicit approval request before changing financial records.
> * Use database transactions to prevent partial updates or double spending.
> * Preserve an audit trail of approvals and completed transactions.
>
> 3. Validation and Testing
> After implementation, verify that:
>
> 1. All six API capabilities are accessible and return valid JSON.
> 2. Ticket retrieval reflects the actual database state.
> 3. Running a valid ticket invokes the real agent workflow and records its activity.
> 4. Invalid or duplicate execution requests are handled safely.
> 5. Agent events can be retrieved and associated with the correct ticket.
> 6. Preparing a payment does not change the checking balance.
> 7. Approving a pending payment updates the database and balance exactly once.
> 8. Repeating an approval request cannot trigger a second deduction.
> 9. Resetting the database restores the original seeded values.
> 10. The backend can start successfully and is ready for integration with the React dashboard.
>
> Use the project's existing testing framework where available. Avoid executing irreversible external financial actions during testing.
> 4. Deliverables
>
> * Primary file: `backend/main.py`, containing the FastAPI application and required routes.
> * Any necessary supporting modules, schemas, or tests, consistent with the existing project structure.
> * A concise summary of the implemented endpoints and how to start the backend.
> * Documentation of any assumptions, unresolved dependencies, or limitations.
>
> Important Constraints
>
> * Do not implement the React frontend yet.
> * Do not invent database tables, columns, MCP tools, or agent capabilities without first inspecting the project.
> * Do not substitute hardcoded sample data for database queries.
> * Do not modify existing financial records except through an explicitly approved transaction or a deliberate database reset.
> * Prioritize a minimal, functional implementation over unnecessary architectural complexity.
>
> Success criterion: The FastAPI backend provides a reliable interface between the React dashboard, the multi-agent system, and the database, while ensuring that agent activity is observable and all financial changes remain under explicit human control.

### Follow-up prompt

> shit sorry, for the last prompt, I missed this part:
>
> From the backend/ folder, start the server with uvicorn main:app --reload --port 8000
>
> This turns on your backend at http://localhost:8000 so the frontend dashboard can call those routes.
>
> In output/harness.md, lsit each route in one line (what URL/what it does).
>
> Can you please fix the previous step based on this new information?

What was lacking after the first prompt: the backend only started from the project root as `backend.main:app`, not with `uvicorn main:app --reload` from `backend/`, and `output/harness.md` had no one-line list of the routes.

### What we worked out before building

- Tickets return their **real DB status** (including `waiting_approval` and `blocked`) plus an `is_resolved` flag, instead of collapsing everything to open/resolved.
- **Approving a payment doesn't resolve a ticket.** The ticket is re-run and the Boss decides, so the Boss keeps the final call.
- **Reset keeps the append-only audit trail.** It appends a `reset` marker and the events feed restarts after it. Nothing is deleted.
- **Runs start in the background** (202 + `run_id`) so the dashboard can poll events live. Same-ticket duplicates get 409.

## Problem 8: Build the Multi-Agent Operations Dashboard

### Initial prompt

> # Problem 8: Build the Multi-Agent Operations Dashboard
>
> ## Objective
>
> Build a polished, interactive operations dashboard using **React + Vite + TypeScript** in the `frontend/` directory.
>
> The dashboard will serve as the human-facing control center for the multi-agent system developed in previous problems. Users should be able to select operational tickets, launch agent workflows, observe agent activity in near real time, review results, approve financial transactions, and monitor the company's checking balance.
>
> Connect the dashboard to the FastAPI backend from Problem 7 at:
>
> `http://localhost:8000`
>
> The final product should feel like a real operations desk, not a generic administrative interface. Prioritize usability, clear information hierarchy, transparency into agent decisions, and a distinctive visual identity.
>
> **Important:** Build a functional application connected to the existing backend and database. Do not create a static prototype or simulate agent activity.
>
> ---
>
> ## 1. Inspect the Existing Project
>
> Before writing frontend code:
>
> 1. Examine the project structure and existing files in `frontend/`, `backend/`, and `output/`.
> 2. Review the FastAPI application in `backend/main.py`.
> 3. Identify the available API endpoints, response schemas, database models, agent definitions, and event structures.
> 4. Review tickets 101, 102, and 103 to understand their actual descriptions, expected workflows, and resolution criteria.
> 5. Identify how the backend represents pending approvals, completed payments, purchases, and agent execution states.
> 6. Reuse existing components, dependencies, and conventions where appropriate.
>
> The frontend must adapt to the actual backend implementation rather than assuming undocumented functionality.
>
> If a required backend capability is missing, implement the smallest necessary compatible enhancement and document it. Preserve existing functionality and financial safeguards.
>
> ## 2. Technology Stack
>
> Use:
>
> - React with TypeScript
> - Vite for development and bundling
> - CSS or Tailwind CSS for styling
> - Fetch API or Axios for backend communication
> - Lucide React for interface icons, if useful
> - React hooks for state and lifecycle management
>
> Additional lightweight dependencies are acceptable if they meaningfully improve the interface.
>
> Organize the frontend into reusable components, typed API functions, and clearly separated application logic.
>
> The application must start with:
>
> ```bash
> cd frontend
> npm install
> npm run dev
> ```
>
> Default frontend URL: `http://localhost:5173`
>
> ## 3. Dashboard Layout and Visual Design
>
> Create a cohesive operational workspace with three primary areas.
>
> ### A. Ticket Queue
>
> Display tickets 101, 102, and 103 in a persistent sidebar or dedicated panel.
>
> Each ticket should display:
>
> - Ticket ID
> - Short title or description
> - Current status
> - Selected or active state
> - Resolution outcome, when available
>
> Support the following visual states:
>
> | Status | Expected behavior |
> |---|---|
> | Open | Ticket is available for execution |
> | Running | Ticket is actively being processed |
> | Awaiting Approval | Agent workflow requires human authorization |
> | Resolved | Ticket has met its resolution criteria |
> | Failed | Execution encountered an error |
>
> If the backend only persists `open` and `resolved`, derive intermediate execution states from run and approval information. Do not invent persisted statuses without updating the backend consistently.
>
> Selecting a ticket should display its details and associated agent activity.
>
> ### B. Agent Activity Workspace
>
> The main panel should show what happens when the agent team works on a ticket.
>
> Display:
>
> - Selected ticket and objective
> - Current execution status
> - Boss agent's coordination and delegations
> - Specialist agents participating in the workflow
> - Agent messages and meaningful actions
> - MCP tools invoked
> - Tool results or concise outcome summaries
> - Errors or blockers
> - Final execution outcome
>
> Design the activity display as a readable timeline or conversation-style feed.
>
> Each agent should have a recognizable visual identity using consistent color accents, typography, labels, or avatar treatments.
>
> **Only display agents that actually participate in the selected ticket.** Do not create fictional delegations or show every specialist by default.
>
> Make the distinction between the Boss, specialist agents, and MCP tool events immediately understandable.
>
> ### C. Financial and Approval Workspace
>
> Create a clearly visible area for the company's financial information and human approval requests.
>
> Display the current checking account balance retrieved from the backend.
>
> When an agent proposes a payment or purchase:
>
> 1. Display an approval request.
> 2. Identify the requesting agent and associated ticket.
> 3. Show the proposed transaction amount.
> 4. Show the vendor or payee, if available.
> 5. Explain the transaction's purpose.
> 6. Display the expected remaining balance after approval.
> 7. Provide a clear **Approve** action.
>
> Include a **Reject** action only if the backend supports rejection or can be extended to support it safely.
>
> Approval must be an explicit human action. Never automatically approve a transaction.
>
> Before approval, the cash balance must remain unchanged.
>
> After successful approval, refresh the checking balance and display the confirmed result.
>
> Do not treat a proposed, pending, or failed payment as completed.
>
> ---
>
> ## 4. Required User Workflows
>
> ### Workflow A: Select and Run a Ticket
>
> 1. Load all three tickets from the backend.
> 2. Allow the user to select an open ticket.
> 3. Display its description and current status.
> 4. Provide a prominent **Run Agent Team** button.
> 5. Call the appropriate backend execution endpoint.
> 6. Display running status immediately after the backend accepts the request.
> 7. Show agent activity as events become available.
> 8. Prevent duplicate execution while a ticket is already running.
> 9. Update the ticket when the backend confirms its final state.
>
> **Important:** Do not mark a ticket resolved simply because an HTTP request completed. Resolution must reflect the actual backend state and the ticket's resolution criteria.
>
> ### Workflow B: Observe Agent Execution
>
> While a ticket runs, display an automatically updating activity feed.
>
> The feed should distinguish among:
>
> - Agent started
> - Boss delegation
> - Specialist message or action
> - MCP tool invocation
> - MCP tool result
> - Human approval requested
> - Workflow completed
> - Workflow failed
>
> Use the event data returned by the backend.
>
> Prefer Server-Sent Events or WebSockets if the backend already supports them. Otherwise, implement lightweight polling.
>
> For polling, use a reasonable interval such as every 1 to 2 seconds while a ticket is active, with slower refreshes or paused polling when idle.
>
> Ensure events are ordered correctly and deduplicated using their identifiers.
>
> Avoid unnecessary rerenders, duplicate events, or excessive API requests.
>
> ### Workflow C: Review Agent Contributions
>
> When execution concludes, display a concise ticket-level summary answering:
>
> - Which agents participated?
> - What did each agent do?
> - Which MCP tools did they use?
> - What information or outcome did each produce?
> - Was the ticket resolved?
> - Did anything require human approval?
> - Were there errors or outstanding tasks?
>
> Use the actual run results and event history.
>
> Where possible, make individual agent summaries expandable so users can inspect supporting events without cluttering the default view.
>
> Do not invent agent activity, tool usage, or completed actions.
>
> ### Workflow D: Approve a Financial Transaction
>
> When an approval request appears:
>
> 1. Display its details prominently.
> 2. Retrieve the latest checking balance.
> 3. Calculate the projected balance after the transaction.
> 4. Ask the user to explicitly approve the action.
> 5. Call the backend approval endpoint.
> 6. Disable the approval action while the request is processing.
> 7. Display the confirmed result.
> 8. Refresh the current balance, ticket state, and relevant events.
>
> Handle insufficient funds, expired approvals, duplicate approvals, and backend failures.
>
> **Financial integrity is critical:** The frontend must not directly alter cash values or assume that a payment succeeded. The backend and database remain the authoritative source.
>
> ---
>
> ## 5. Backend Integration
>
> Use the existing FastAPI routes from Problem 7.
>
> Expected API contract:
>
> | Method | Endpoint | Purpose |
> |---|---|---|
> | GET | `/api/tickets` | Retrieve tickets and statuses |
> | POST | `/api/tickets/{ticket_id}/run` | Start the agent workflow |
> | GET | `/api/events` | Retrieve agent activity |
> | POST | `/api/approvals/{approval_id}/approve` | Approve a proposed financial transaction |
> | GET | `/api/cash` | Retrieve checking balance |
> | POST | `/api/reset` | Restore original database state |
>
> Inspect actual backend response schemas and implement TypeScript interfaces that match them.
>
> For example, the frontend may need types representing:
>
> - Ticket
> - TicketStatus
> - AgentEvent
> - AgentRun
> - ApprovalRequest
> - CashAccount
> - APIError
>
> Use the actual available schema fields rather than fabricating values.
>
> If the existing backend does not provide an endpoint for discovering pending approvals, add a minimal read-only endpoint such as:
>
> `GET /api/approvals?status=pending`
>
> This endpoint must retrieve real approval records from the database.
>
> If the backend lacks a reliable way to determine run completion, expose the necessary run status rather than guessing based on elapsed time.
>
> ### API Configuration
>
> Configure the frontend API base URL using a Vite environment variable:
>
> `VITE_API_BASE_URL=http://localhost:8000`
>
> Provide a sensible local-development default.
>
> On the FastAPI backend, configure CORS to allow:
>
> `http://localhost:5173`
>
> Also account for `http://127.0.0.1:5173` where appropriate.
>
> Allow the required HTTP methods and headers.
>
> Do not use unrestricted production CORS settings.
>
> ---
>
> ## 6. Visual Identity and Creative Direction
>
> The interface should feel like a thoughtfully designed **AI-powered operations control room**.
>
> Take inspiration from the clarity of modern developer tools, the information density of trading terminals, and the approachable interaction patterns of well-designed productivity applications.
>
> Creative direction:
>
> - Sophisticated, restrained visual palette
> - Strong typographic hierarchy
> - Clear separation between ticket management, agent activity, and financial approvals
> - Subtle animations for active agent workflows
> - Distinct but coordinated agent identities
> - Comfortable spacing and readable event histories
> - High-contrast status indicators
> - Responsive layout for common desktop and laptop screen sizes
>
> Make the interface feel alive through meaningful state changes rather than decorative animation.
>
> Examples of useful visual treatments include a subtle activity indicator while an agent runs, a clear visual transition when a ticket resolves, and an updated financial balance after a confirmed payment.
>
> Avoid generic AI-themed visuals, excessive gradients, unnecessary charts, and clutter.
>
> Use the ticket and agent information to make the dashboard feel specific to **Campus Customs**, rather than a reusable template with no operational personality.
>
> The finished interface should communicate three things immediately:
>
> 1. What work needs attention.
> 2. What the agents are doing.
> 3. What decisions require a human.
>
> You have creative freedom over the exact layout, colors, typography, and component styling, provided the application remains intuitive and professional.
>
> ---
>
> ## 7. Interaction and State Requirements
>
> The dashboard should handle all major application states gracefully.
>
> **Initial loading:** Show appropriate loading indicators while retrieving tickets, cash, and activity.
>
> **Empty activity:** Display a useful empty state before a ticket has been executed.
>
> **Running:** Clearly show that execution is in progress and prevent duplicate submissions.
>
> **Awaiting approval:** Make pending human decisions easy to identify without interrupting access to the activity history.
>
> **Resolved:** Show a clear completion state and retain the execution history for review.
>
> **Failed:** Display understandable error messages and appropriate retry options.
>
> **Backend disconnected:** Inform the user that the API is unavailable instead of presenting misleading data.
>
> **Refresh:** Preserve the correct backend-driven ticket statuses, approvals, and financial balance after a browser refresh.
>
> Include a confirmation dialog for any destructive reset operation.
>
> Do not reset application data automatically during startup or refresh.
>
> Use accessible button labels, keyboard navigation, visible focus states, and readable contrast.
>
> ---
>
> ## 8. Reset Functionality
>
> Provide a secondary **Reset Demo** control for development and testing.
>
> When activated:
>
> 1. Display a confirmation dialog explaining that current demo progress will be cleared.
> 2. Require the user to explicitly confirm.
> 3. Call `POST /api/reset`.
> 4. Refresh ticket statuses, agent events, approvals, and checking balance.
> 5. Return the dashboard to its initial seeded state.
>
> Do not expose reset functionality as a prominent everyday action.
>
> If the reset endpoint is disabled outside development, hide or disable this control accordingly.
>
> ---
>
> ## 9. Testing and Acceptance Criteria
>
> Run the application and verify the following end-to-end behaviors.
>
> ### Ticket Management
> - All three tickets appear with correct IDs and descriptions.
> - Selecting a ticket loads its corresponding details.
> - Clicking Run starts the real agent workflow.
> - Multiple clicks cannot accidentally trigger duplicate runs.
> - Ticket status updates reflect backend state.
> - Resolved tickets remain resolved after browser refresh.
>
> ### Agent Observability
> - Agent events appear during execution.
> - Boss and specialist agents are visually distinguishable.
> - MCP tool invocations are visible.
> - Events appear in the correct order without duplicates.
> - Only participating agents appear in ticket-specific activity.
> - Completed runs provide a meaningful agent-by-agent summary.
>
> ### Financial Operations
> - Checking balance matches the `cash_accounts` database.
> - Proposing a payment does not alter the balance.
> - Pending approvals display accurate amounts and transaction details.
> - Human approval invokes the backend approval route.
> - Successful approval updates the displayed balance.
> - Duplicate approval attempts do not create duplicate deductions.
> - Failed payments do not display as completed.
>
> ### Application Quality
> - The dashboard starts with `npm run dev`.
> - The frontend can reach FastAPI without CORS errors.
> - TypeScript compilation succeeds.
> - There are no material browser-console errors.
> - Layout and interactions work at typical laptop and desktop widths.
> - Loading, empty, failure, and success states are handled appropriately.
> - Reset restores the seeded demo state after confirmation.
>
> Test actual backend integration rather than relying solely on mocked frontend data.
>
> If dependencies or environment limitations prevent a complete test, document precisely what was verified and what remains untested.
>
> ---
>
> ## 10. Design Documentation
>
> Create:
>
> `output/design.md`
>
> Document the design rationale, including:
>
> **Layout:** Explain the structure of the dashboard and why ticket management, agent activity, and financial controls are positioned as they are.
>
> **Agent identities:** Explain how users can distinguish the Boss from specialists and understand what each agent is doing.
>
> **Ticket states:** Explain how open, running, awaiting approval, resolved, and failed tickets are represented visually.
>
> **Cash and approvals:** Explain how checking balance, pending transactions, and confirmed payments are presented to maintain financial clarity.
>
> **Interaction design:** Explain how real-time updates, execution controls, confirmations, and error handling improve usability.
>
> **Creative decisions:** Identify at least three intentional design details that make the dashboard distinctive, useful, and enjoyable for a human operator.
>
> Explain the rationale behind the design rather than simply listing UI features.
>
> ---
>
> ## 11. Deliverables
>
> Complete the following:
>
> 1. A functional React + Vite + TypeScript application inside `frontend/`.
> 2. Reusable frontend components, typed API integration, and styling.
> 3. Any minimal backend additions required for complete integration.
> 4. A working local development configuration.
> 5. `output/design.md`, documenting the design choices and rationale.
>
> Provide a final implementation summary covering the major features, files created or modified, startup commands, and testing results.
>
> ### Final Success Criteria
>
> The project is complete when a user can open the React dashboard, see all three tickets, start an agent workflow, observe real agent and MCP activity, review each agent's contribution, approve a pending payment, and see the checking balance update correctly.
>
> **The dashboard must reflect actual backend and database state at every step.**
>
> Do not mark a ticket resolved prematurely, invent agent execution events, simulate financial changes, or bypass human approval requirements.
>
> Prioritize a working, coherent, and visually distinctive operations desk over unnecessary complexity.

### What we worked out before building

- The pasted prompt was cut off mid-section the first time. Building waited for the complete text so no graded requirement was guessed.
- The dashboard shows the real DB status plus derived states (**Running**, **Failed**, and **Approved · re-run to close**) instead of collapsing everything to open/resolved. A ticket only turns green when the Boss resolves it.
- Live testing exposed a gap: after rent was paid, a re-run flagged the lease's moved-forward due date as a "discrepancy" and blocked the ticket. `get_rent_status` now reports rent payments on file, and the Boss/Facilities prompts say when a paid rent notice is resolved.
- Small backend additions for the UI: `last_run` on tickets (rebuilt from the audit trail), payee/description on approvals, `reset_enabled` and `last_reset_seq` on health, and whole (unclipped) agent reports in the audit trail.
