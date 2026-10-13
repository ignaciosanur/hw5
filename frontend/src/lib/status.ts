import type { Ticket } from "./types";

/**
 * What the dashboard shows for a ticket. Persisted statuses come from tickets.status;
 * running / failed come from the run record; "approved, re-run" means every request the
 * Boss was waiting on has been decided, so the Boss can be run again to close the ticket.
 */
export type DeskState =
  | "running" | "failed" | "resolved" | "awaiting_approval" | "approved_rerun" | "blocked" | "in_progress" | "open";

export function deskState(t: Ticket): DeskState {
  if (t.running || t.last_run?.status === "running") return "running";
  if (t.status === "resolved") return "resolved";
  if (t.last_run && (t.last_run.status === "failed" || t.last_run.status === "interrupted")) return "failed";
  if (t.pending_approval_ids.length > 0) return "awaiting_approval";
  if (t.status === "waiting_approval") return "approved_rerun";
  if (t.status === "blocked") return "blocked";
  if (t.status === "in_progress") return "in_progress";
  return "open";
}

export const STATE_LABEL: Record<DeskState, string> = {
  running: "Running",
  failed: "Failed",
  resolved: "Resolved",
  awaiting_approval: "Awaiting approval",
  approved_rerun: "Approved · re-run to close",
  blocked: "Blocked",
  in_progress: "In progress",
  open: "Open",
};

export const STATE_HINT: Record<DeskState, string> = {
  running: "The agent team is working on this ticket now.",
  failed: "The last run hit an error. Nothing was marked resolved; you can retry.",
  resolved: "The Boss marked this ticket resolved.",
  awaiting_approval: "The agents filed a payment that needs your approval.",
  approved_rerun: "Every payment for this ticket has been decided. Run the team again so the Boss can close it.",
  blocked: "The Boss can't move this ticket forward yet. See the outcome for why.",
  in_progress: "Work has started; nothing is waiting on you.",
  open: "Ready for the agent team.",
};

/** Can the Run button be used? Resolved tickets are closed; running ones are locked. */
export const canRun = (s: DeskState) => s !== "running" && s !== "resolved";
