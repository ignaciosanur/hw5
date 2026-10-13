// Mirrors the Pydantic response models in backend/models.py (Problem 7 API).

export type TicketDbStatus = "open" | "in_progress" | "waiting_approval" | "blocked" | "resolved";
export type AgentName = "boss" | "inventory" | "accounting" | "facilities" | "customer_service";

export interface TicketDecision {
  ticket_id: number;
  status: TicketDbStatus;
  decision: string;
  reasoning: string;
  payment_request_ids: number[];
  draft_ids: number[];
  waiting_on_human: string[];
  next_steps: string[];
}

export interface RunSummary {
  run_id: string;
  status: "running" | "finished" | "failed" | "interrupted";
  started_at: string;
  finished_at: string | null;
  decision: TicketDecision | null;
  error: string | null;
}

export interface Ticket {
  id: number;
  type: string;
  requester: string;
  subject: string;
  description: string;
  status: TicketDbStatus;
  is_resolved: boolean;
  sku: string | null;
  size: string | null;
  qty: number | null;
  lease_id: number | null;
  invoice_id: number | null;
  created_at: string;
  decision_notes: string[];
  pending_approval_ids: number[];
  draft_ids: number[];
  running: boolean;
  last_run_id: string | null;
  last_run: RunSummary | null;
}

export interface RunAccepted {
  run_id: string;
  ticket_id: number;
  status: "running";
  events_url: string;
}

export interface AgentRun {
  run_id: string;
  ticket_id: number;
  status: "running" | "finished" | "failed";
  started_at: string;
  finished_at: string | null;
  result: Record<string, unknown> | null;
}

export type EventType =
  | "run_started" | "user_prompt" | "model_request" | "model_response" | "end"
  | "delegation_started" | "delegation_done" | "delegation_refused" | "delegation_failed"
  | "run_finished" | "approval" | "rejection" | "reset";

export interface AgentEvent {
  seq: number;
  ts: string;
  run_id: string | null;
  ticket_id: number | null;
  agent: string | null; // an AgentName, or "human" for approvals
  depth: number | null;
  event: EventType | string;
  summary: string;
  detail: Record<string, any>; // shape depends on `event`; see lib/feed.ts
}

export interface CashAccount {
  name: string;
  balance: number;
  as_of: string;
}

export interface Cash {
  account: string;
  balance: number;
  currency: string | null;
  as_of: string;
  accounts: CashAccount[];
  pending_approvals_total: number;
  balance_if_all_pending_approved: number;
}

export type ApprovalStatus = "pending" | "paid" | "rejected";

export interface ApprovalRequest {
  id: number;
  kind: "rent" | "invoice" | "purchase_order";
  ref_id: number | null;
  vendor_id: number | null;
  sku: string | null;
  size: string | null;
  qty: number | null;
  amount: number;
  account: string;
  reason: string;
  ticket_id: number | null;
  requested_by: string;
  status: ApprovalStatus;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  payment_id: number | null;
  payee: string | null;
  description: string | null;
}

export interface ApprovalResult {
  approval: ApprovalRequest;
  payment: Record<string, unknown>;
  cash: Cash;
}

export interface Health {
  ok: boolean;
  env: string;
  reset_enabled: boolean;
  last_reset_seq: number;
  active_runs: Record<string, string>;
}

export interface ResetResult {
  ok: boolean;
  tickets: { id: number; status: string }[];
  cash: Cash;
  payments: number;
  pending_approvals: number;
  drafts: number;
  events_marker_seq: number;
}
