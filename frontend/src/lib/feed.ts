// Turns raw audit-trail events (GET /api/events) into the activity feed and the
// per-agent run summary. Nothing here invents activity: every item maps to a real event.
import { money, parseMaybe } from "./format";
import type { AgentEvent, TicketDecision } from "./types";

/** Tools that are orchestration, not MCP shop tools. */
const NOT_MCP = new Set(["delegate", "final_result"]);

export type FeedKind =
  | "run_start" | "agent_start" | "delegation" | "report" | "tool" | "message" | "approval_requested"
  | "final" | "refused" | "error" | "run_done" | "run_failed" | "human_approval" | "human_rejection";

export interface FeedItem {
  key: string;
  seq: number;
  ts: string;
  runId: string | null;
  agent: string;
  depth: number;
  kind: FeedKind;
  title: string;
  body?: string;
  toAgent?: string;
  tool?: { name: string; args: Record<string, unknown>; result?: unknown; resultText?: string; pending: boolean };
  decision?: TicketDecision;
  report?: SpecialistReport;
}

export interface SpecialistReport {
  agent: string;
  summary: string;
  facts: string[];
  actions_taken: string[];
  payment_request_ids: number[];
  draft_ids: number[];
  needs_human_approval: string[];
  blockers: string[];
  recommendation: string;
}

// ------------------------------------------------------------------ tool result one-liners
export function toolSummary(name: string, r: any): string {
  if (!r || typeof r !== "object") return "";
  if (r.found === false || r.ok === false) return r.message ?? "refused";
  switch (name) {
    case "check_stock":
      return `${r.qty} on hand${r.location ? ` (${r.location})` : ""} · need ${r.qty_needed} · short ${r.shortfall}`;
    case "list_inventory":
      return (r.items ?? []).map((i: any) => `${i.size} ${i.qty}`).join(" · ");
    case "get_vendor_status":
      return (r.vendors ?? [])
        .map((v: any) => `${v.name}: ${v.can_ship ? "can ship" : `blocked (${v.open_invoices.length} unpaid)`}`)
        .join(" · ");
    case "get_rent_status":
      return `${money(r.monthly_rent)} due ${r.next_due} (${r.days_until_due} days) · cash after ${money(r.cash_after_rent)}`;
    case "get_cash_position":
      return `cash ${money(r.total_cash)} · ${(r.payment_queue ?? []).length} in queue · ${money(r.cash_left_after_queue)} left after queue`;
    case "get_pricing":
      return `${money(r.unit_price)}/unit at ${r.discount_pct}% off · margin ${r.margin_pct}% · ${r.within_policy ? "within policy" : "OVER policy cap"}`;
    case "request_payment":
      return `request #${r.request_id} · ${money(r.amount)} · waiting for human approval`;
    case "list_payment_requests":
      return `${r.count} request(s), ${money(r.total_amount)}`;
    case "get_ticket":
      return `#${r.ticket?.id} ${r.ticket?.subject} · ${r.ticket?.status}`;
    case "list_open_tickets":
      return `${r.count} open ticket(s)`;
    case "update_ticket":
      return `status → ${r.status}`;
    case "save_customer_draft":
      return `draft #${r.draft_id} to ${r.recipient} · not sent`;
    case "list_drafts":
      return `${r.count} draft(s)`;
    default:
      return "";
  }
}

const argText = (args: Record<string, unknown>) =>
  Object.entries(args)
    .filter(([k]) => !["body", "reason", "note"].includes(k))
    .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join(", ");
export const callSignature = (name: string, args: Record<string, unknown>) => `${name}(${argText(args)})`;

function taskFrom(prompt: string): string {
  const m = /Task:\s*([\s\S]*?)(?:\nWhy they need it:|$)/.exec(prompt);
  return (m ? m[1] : prompt).trim();
}

// ------------------------------------------------------------------ feed
export function buildFeed(events: AgentEvent[]): FeedItem[] {
  // Pair each MCP tool call with its result by tool_call_id.
  const results = new Map<string, string>();
  for (const e of events)
    if (e.event === "model_request")
      for (const r of e.detail.tool_results ?? []) results.set(r.tool_call_id, r.result);

  const items: FeedItem[] = [];
  for (const e of events) {
    const base = {
      seq: e.seq, ts: e.ts, runId: e.run_id, agent: e.agent ?? "system", depth: e.depth ?? 0,
    };
    const d = e.detail ?? {};
    switch (e.event) {
      case "run_started":
        items.push({ ...base, key: `${e.seq}`, kind: "run_start", title: "Agent team started" });
        break;
      case "user_prompt":
        if ((e.depth ?? 0) > 0)
          items.push({ ...base, key: `${e.seq}`, kind: "agent_start", title: "picked up the task", body: taskFrom(String(d.prompt ?? "")) });
        break;
      case "delegation_started":
        items.push({ ...base, key: `${e.seq}`, kind: "delegation", toAgent: d.to_agent, title: "delegates", body: d.task });
        break;
      case "delegation_done": {
        const report = parseMaybe(d.report) as SpecialistReport | null;
        items.push({ ...base, key: `${e.seq}`, kind: "report", toAgent: d.to_agent, title: "reported back",
          body: report?.summary ?? undefined, report: report ?? undefined });
        break;
      }
      case "delegation_refused":
        items.push({ ...base, key: `${e.seq}`, kind: "refused", toAgent: d.to_agent, title: "hand-off refused", body: d.reason });
        break;
      case "delegation_failed":
        items.push({ ...base, key: `${e.seq}`, kind: "error", toAgent: d.to_agent, title: "teammate failed", body: d.error });
        break;
      case "model_response": {
        for (const c of d.tool_calls ?? []) {
          if (c.tool === "final_result") {
            const a = c.args ?? {};
            items.push({ ...base, key: `${e.seq}-${c.tool_call_id}`, kind: "final",
              title: e.agent === "boss" ? "made the call" : "wrote its report",
              body: a.decision ?? a.summary, decision: e.agent === "boss" ? (a as TicketDecision) : undefined,
              report: e.agent !== "boss" ? (a as SpecialistReport) : undefined });
            continue;
          }
          if (NOT_MCP.has(c.tool)) continue; // delegations have their own events
          const raw = results.get(c.tool_call_id);
          const parsed = raw === undefined ? undefined : parseMaybe(raw);
          const isRequest = c.tool === "request_payment" && parsed?.ok === true;
          items.push({
            ...base, key: `${e.seq}-${c.tool_call_id}`, kind: isRequest ? "approval_requested" : "tool",
            title: isRequest ? "asked for human approval" : "called",
            tool: { name: c.tool, args: c.args ?? {}, result: parsed, pending: raw === undefined,
              resultText: parsed ? toolSummary(c.tool, parsed) : raw?.slice(0, 200) },
          });
        }
        if (d.text?.trim()) items.push({ ...base, key: `${e.seq}-text`, kind: "message", title: "says", body: d.text });
        break;
      }
      case "run_finished":
        if (d.ok) items.push({ ...base, key: `${e.seq}`, kind: "run_done", title: "Workflow completed", decision: d.decision, body: d.decision?.decision });
        else items.push({ ...base, key: `${e.seq}`, kind: "run_failed", title: "Workflow failed", body: d.error });
        break;
      case "approval":
        items.push({ ...base, key: `${e.seq}`, agent: "human", kind: "human_approval",
          title: `approved request #${d.request_id}`, body: `${money(d.amount)} paid by ${d.approved_by} · balance ${money(d.balance_after)}` });
        break;
      case "rejection":
        items.push({ ...base, key: `${e.seq}`, agent: "human", kind: "human_rejection",
          title: `rejected request #${d.request_id}`, body: d.reason });
        break;
      default:
        break; // model_request (paired above), end, reset: not shown on their own
    }
  }
  return items;
}

// ------------------------------------------------------------------ run summary (Workflow C)
export interface AgentContribution {
  agent: string;
  tasks: string[];
  delegatedTo: string[];
  tools: { name: string; count: number; lastResult: string }[];
  output?: string;
  report?: SpecialistReport;
  approvalsRequested: { requestId: number; amount: number }[];
  drafts: { subject: string; body: string; draftId?: number }[];
  problems: string[];
  items: FeedItem[];
}

export interface RunReview {
  runId: string;
  participants: AgentContribution[];
  decision?: TicketDecision;
  failed?: string;
  finished: boolean;
}

export function reviewRun(events: AgentEvent[], runId: string): RunReview {
  const runEvents = events.filter((e) => e.run_id === runId);
  const feed = buildFeed(runEvents);
  const byAgent = new Map<string, AgentContribution>();
  const get = (agent: string) => {
    if (!byAgent.has(agent))
      byAgent.set(agent, { agent, tasks: [], delegatedTo: [], tools: [], approvalsRequested: [], drafts: [], problems: [], items: [] });
    return byAgent.get(agent)!;
  };
  let decision: TicketDecision | undefined;
  let failed: string | undefined;
  let finished = false;

  for (const it of feed) {
    if (it.kind === "run_start") continue;
    if (it.kind === "run_done" || it.kind === "run_failed") {
      finished = true;
      if (it.kind === "run_done") decision = it.decision;
      else failed = it.body;
      continue;
    }
    const c = get(it.agent);
    c.items.push(it);
    if (it.kind === "agent_start" && it.body) c.tasks.push(it.body);
    if (it.kind === "delegation" && it.toAgent) c.delegatedTo.push(it.toAgent);
    if (it.kind === "tool" || it.kind === "approval_requested") {
      const t = it.tool!;
      const row = c.tools.find((x) => x.name === t.name);
      if (row) { row.count += 1; row.lastResult = t.resultText ?? row.lastResult; }
      else c.tools.push({ name: t.name, count: 1, lastResult: t.resultText ?? "" });
      const r = t.result as any;
      if (it.kind === "approval_requested") c.approvalsRequested.push({ requestId: r.request_id, amount: r.amount });
      if (t.name === "save_customer_draft")
        c.drafts.push({ subject: String(t.args.subject ?? ""), body: String(t.args.body ?? ""), draftId: r?.draft_id });
    }
    if (it.kind === "final") {
      c.output = it.body;
      if (it.report) c.report = it.report;
      if (it.decision) decision = decision ?? it.decision;
    }
    if (it.kind === "refused" || it.kind === "error") c.problems.push(`${it.title}: ${it.body ?? ""}`);
  }
  return { runId, participants: [...byAgent.values()], decision, failed, finished };
}
