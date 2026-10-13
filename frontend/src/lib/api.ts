import type {
  AgentEvent, AgentRun, ApprovalRequest, ApprovalResult, Cash, Health, ResetResult, RunAccepted, Ticket,
} from "./types";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** Any non-2xx response or network failure. `status` 0 means the API couldn't be reached. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
  get offline() {
    return this.status === 0;
  }
}

function messageFrom(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
    if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg ?? String(x)).join("; ");
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError(0, `Can't reach the API at ${API_BASE}.`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    throw new ApiError(res.status, messageFrom(detail, `${res.status} ${res.statusText}`), detail);
  }
  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => request<Health>("/api/health"),
  tickets: () => request<Ticket[]>("/api/tickets"),
  runTicket: (id: number) => post<RunAccepted>(`/api/tickets/${id}/run`),
  run: (runId: string) => request<AgentRun>(`/api/runs/${encodeURIComponent(runId)}`),
  events: (q: { ticketId?: number; afterSeq?: number; limit?: number }) => {
    const p = new URLSearchParams();
    if (q.ticketId !== undefined) p.set("ticket_id", String(q.ticketId));
    if (q.afterSeq) p.set("after_seq", String(q.afterSeq));
    p.set("limit", String(q.limit ?? 1000));
    return request<AgentEvent[]>(`/api/events?${p}`);
  },
  approvals: () => request<ApprovalRequest[]>("/api/approvals"),
  approve: (id: number, approvedBy: string) =>
    post<ApprovalResult>(`/api/approvals/${id}/approve`, { approved_by: approvedBy }),
  reject: (id: number, rejectedBy: string, reason: string) =>
    post<ApprovalRequest>(`/api/approvals/${id}/reject`, { rejected_by: rejectedBy, reason }),
  cash: () => request<Cash>("/api/cash"),
  reset: () => post<ResetResult>("/api/reset"),
};
