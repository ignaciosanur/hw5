import { ChevronRight, Hand, Inbox, Loader2, Play, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { agentOf } from "../lib/agents";
import { duration, money, TICKET_KIND } from "../lib/format";
import { buildFeed, reviewRun } from "../lib/feed";
import { canRun, deskState, STATE_HINT } from "../lib/status";
import type { AgentEvent, ApprovalRequest, Ticket } from "../lib/types";
import { AgentAvatar } from "./AgentAvatar";
import { RunReview } from "./RunReview";
import { StatusPill } from "./StatusPill";
import { Timeline } from "./Timeline";

interface Props {
  ticket: Ticket | null;
  events: AgentEvent[];
  eventsLoaded: boolean;
  approvals: ApprovalRequest[];
  starting: boolean;
  offline: boolean;
  onRun: () => void;
  onShowApproval: (id: number) => void;
}

export function Workspace({ ticket, events, eventsLoaded, approvals, starting, offline, onRun, onShowApproval }: Props) {
  const feed = useMemo(() => buildFeed(events), [events]);
  const runIds = useMemo(() => [...new Set(events.map((e) => e.run_id).filter(Boolean))] as string[], [events]);
  const latestRun = runIds[runIds.length - 1];
  const review = useMemo(() => (latestRun ? reviewRun(events, latestRun) : null), [events, latestRun]);
  // The latest run is what the operator is watching; earlier runs fold away but stay reviewable.
  const latestFeed = useMemo(() => feed.filter((f) => f.runId === latestRun || (f.runId == null && f.seq > (events.find((e) => e.run_id === latestRun)?.seq ?? 0))), [feed, latestRun, events]);
  const earlierFeed = useMemo(() => feed.filter((f) => !latestFeed.includes(f)), [feed, latestFeed]);
  const [showEarlier, setShowEarlier] = useState(false);

  if (!ticket)
    return <main className="workspace"><div className="empty"><Loader2 className="spin" aria-hidden="true" /> Loading tickets…</div></main>;

  const state = deskState(ticket);
  const running = state === "running";
  const pending = approvals.filter((a) => a.ticket_id === ticket.id && a.status === "pending");
  // Only agents that actually appear in this ticket's events, in order of first appearance.
  const crew = review ? review.participants.map((p) => p.agent).filter((a) => a !== "human") : [];
  const activeAgent = running ? [...events].reverse().find((e) => e.run_id === latestRun && e.agent && e.agent !== "human")?.agent : undefined;
  const facts = [
    ticket.sku && `${ticket.sku}${ticket.size ? ` · size ${ticket.size}` : ""}${ticket.qty ? ` · qty ${ticket.qty}` : ""}`,
    ticket.invoice_id && `linked invoice #${ticket.invoice_id}`,
    ticket.lease_id && `lease #${ticket.lease_id}`,
  ].filter(Boolean) as string[];

  return (
    <main className={`workspace${running ? " is-running" : ""}`} aria-labelledby="ticket-title">
      <header className="brief">
        <div className="brief-meta">
          <span className="ticket-id big">#{ticket.id}</span>
          <span>{TICKET_KIND[ticket.type] ?? ticket.type}</span>
          <span className="dot">·</span>
          <span>from <strong>{ticket.requester}</strong></span>
        </div>
        <div className="brief-row">
          <div className="brief-text">
            <h1 id="ticket-title">{ticket.subject}</h1>
            <blockquote>“{ticket.description}”</blockquote>
            {facts.length > 0 && <div className="chips">{facts.map((f) => <span key={f} className="chip">{f}</span>)}</div>}
          </div>
          <div className="brief-actions">
            <StatusPill state={state} />
            <button
              className="btn btn--primary btn--run"
              onClick={onRun}
              disabled={!canRun(state) || starting || offline}
              aria-describedby="run-hint"
            >
              {running || starting ? <Loader2 size={16} className="spin" aria-hidden="true" /> :
                state === "failed" || state === "approved_rerun" ? <RotateCw size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {starting ? "Starting…" : running ? "Agents working…" :
                state === "failed" ? "Retry agent team" : review ? "Run agent team again" : "Run Agent Team"}
            </button>
            <p id="run-hint" className="hint">{STATE_HINT[state]}</p>
          </div>
        </div>

        {pending.length > 0 && (
          <button className="attention" onClick={() => onShowApproval(pending[0].id)}>
            <Hand size={16} aria-hidden="true" />
            {pending.length === 1
              ? `${money(pending[0].amount)} to ${pending[0].payee ?? "payee"} is waiting for your approval`
              : `${pending.length} payments are waiting for your approval`}
            <span className="attention-go">Review →</span>
          </button>
        )}

        {crew.length > 0 && (
          <div className="crew" aria-label="Agents on this ticket">
            <span className="crew-label">{running ? "On the job" : "Worked on this ticket"}</span>
            {crew.map((a) => (
              <span key={a} className={`crew-member${a === activeAgent ? " is-active" : ""}`}>
                <AgentAvatar agent={a} size={24} active={a === activeAgent} />
                {agentOf(a).name}
              </span>
            ))}
            {running && ticket.last_run && <span className="crew-timer">{duration(ticket.last_run.started_at)}</span>}
          </div>
        )}
      </header>

      {state === "failed" && ticket.last_run && (
        <div className="alert alert--bad" role="alert">
          The last run {ticket.last_run.status === "interrupted" ? "was interrupted (the server restarted mid-run)" : `failed: ${ticket.last_run.error ?? "unknown error"}`}.
          {" "}Nothing was marked resolved. Use “Retry agent team” to run it again.
        </div>
      )}

      {review?.finished && !running && (
        <RunReview review={review} approvals={approvals} ticketStatus={ticket.status}
          bossNote={ticket.decision_notes.at(-1)?.replace(/^\[[^\]]*\]\s*/, "")} />
      )}

      <section className="activity" aria-label="Activity feed">
        <h3 className="section-label">
          Activity {running && <span className="live"><span className="live-dot" />live</span>}
        </h3>
        {!eventsLoaded ? (
          <div className="empty"><Loader2 className="spin" aria-hidden="true" /> Loading activity…</div>
        ) : feed.length === 0 ? (
          <div className="empty">
            <Inbox size={28} aria-hidden="true" />
            <p><strong>No agent activity yet.</strong></p>
            <p className="muted">Press “Run Agent Team”. The Boss reads ticket #{ticket.id}, decides which specialists it needs, and every step they take (delegations, MCP tool calls, results) appears here as it happens.</p>
          </div>
        ) : (
          <>
            {earlierFeed.length > 0 && (
              <button className="earlier" onClick={() => setShowEarlier((v) => !v)} aria-expanded={showEarlier}>
                <ChevronRight size={14} className={`chev${showEarlier ? " is-open-right" : ""}`} aria-hidden="true" />
                {showEarlier ? "Hide" : "Show"} {runIds.length - 1} earlier run{runIds.length > 2 ? "s" : ""} ({earlierFeed.length} steps)
              </button>
            )}
            {showEarlier && <div className="earlier-feed"><Timeline items={earlierFeed} /></div>}
            <Timeline items={latestFeed} />
          </>
        )}
      </section>
    </main>
  );
}
