import { AlertTriangle, ChevronDown, FileText, Hand, ListChecks, Wrench } from "lucide-react";
import { useState } from "react";
import { agentOf } from "../lib/agents";
import { money } from "../lib/format";
import type { AgentContribution, RunReview as Review } from "../lib/feed";
import type { ApprovalRequest } from "../lib/types";
import { AgentAvatar } from "./AgentAvatar";
import { Timeline } from "./Timeline";

function Contribution({ c }: { c: AgentContribution }) {
  const [open, setOpen] = useState(false);
  const a = agentOf(c.agent);
  const r = c.report;
  return (
    <article className={`contrib tone-${a.tone}`}>
      <button className="contrib-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <AgentAvatar agent={c.agent} size={30} />
        <span className="contrib-who">
          <strong>{a.name}</strong>
          <span className="muted">{c.tasks[0] ? "asked to: " + c.tasks[0] : a.role}</span>
        </span>
        <span className="contrib-meta">
          {c.tools.length > 0 && <span><Wrench size={12} aria-hidden="true" /> {c.tools.reduce((n, t) => n + t.count, 0)} tool calls</span>}
          {c.delegatedTo.length > 0 && <span>→ {c.delegatedTo.map((d) => agentOf(d).name).join(", ")}</span>}
        </span>
        <ChevronDown size={16} className={`chev${open ? " is-open" : ""}`} aria-hidden="true" />
      </button>
      <p className="contrib-output">{c.output ?? "No final report recorded."}</p>
      {c.tools.length > 0 && (
        <ul className="contrib-tools">
          {c.tools.map((t) => (
            <li key={t.name}><code>{t.name}</code>{t.count > 1 && <span className="muted"> ×{t.count}</span>}<span> {t.lastResult}</span></li>
          ))}
        </ul>
      )}
      {c.approvalsRequested.map((x) => (
        <p key={x.requestId} className="contrib-flag"><Hand size={13} aria-hidden="true" /> Filed request #{x.requestId} for {money(x.amount)}. Needs a human.</p>
      ))}
      {c.problems.map((p, i) => (
        <p key={i} className="contrib-flag is-bad"><AlertTriangle size={13} aria-hidden="true" /> {p}</p>
      ))}
      {open && (
        <div className="contrib-detail">
          {r && r.facts?.length > 0 && (
            <>
              <h4>Facts it relied on</h4>
              <ul>{r.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </>
          )}
          {r?.recommendation && (<><h4>Recommendation</h4><p>{r.recommendation}</p></>)}
          {c.drafts.map((d, i) => (
            <div key={i} className="draft">
              <h4><FileText size={13} aria-hidden="true" /> Draft{d.draftId ? ` #${d.draftId}` : ""} · not sent</h4>
              <p className="draft-subject">{d.subject}</p>
              <p className="draft-body">{d.body}</p>
            </div>
          ))}
          <h4>Supporting events</h4>
          <Timeline items={c.items} />
        </div>
      )}
    </article>
  );
}

export function RunReview({ review, approvals, ticketStatus, bossNote }: {
  review: Review; approvals: ApprovalRequest[]; ticketStatus: string; bossNote?: string;
}) {
  const d = review.decision;
  const filed = (d?.payment_request_ids ?? []).map((id) => approvals.find((a) => a.id === id)).filter(Boolean) as ApprovalRequest[];
  return (
    <section className="review" aria-label="Run outcome">
      <div className={`verdict${review.failed ? " is-bad" : ""}`}>
        <div className="verdict-label"><ListChecks size={15} aria-hidden="true" /> Outcome of run {review.runId}</div>
        {review.failed ? (
          // The DB status is the truth: a run can error *after* the Boss already recorded its call.
          ticketStatus === "resolved" ? (
            <>
              <p className="verdict-text">Resolved by the Boss. The run then ended with an error ({review.failed}) before writing its final summary.</p>
              {bossNote && <p className="verdict-why">Boss's recorded decision: {bossNote}</p>}
            </>
          ) : (
            <p className="verdict-text">The run failed: {review.failed}. The ticket was not marked resolved.</p>
          )
        ) : d ? (
          <>
            <p className="verdict-text">{d.decision}</p>
            <p className="verdict-why">{d.reasoning}</p>
            <dl className="verdict-grid">
              <div><dt>Resolved?</dt><dd>{d.status === "resolved" ? "Yes" : `No: Boss set “${d.status.replace("_", " ")}”`}</dd></div>
              <div><dt>Payments filed</dt><dd>{filed.length ? filed.map((a) => `#${a.id} ${money(a.amount)} (${a.status})`).join(", ") : "None"}</dd></div>
              <div><dt>Drafts</dt><dd>{d.draft_ids.length ? d.draft_ids.map((x) => `#${x}`).join(", ") + " (not sent)" : "None"}</dd></div>
            </dl>
            {d.waiting_on_human.length > 0 && (
              <><h4>Waiting on a human</h4><ul>{d.waiting_on_human.map((w, i) => <li key={i}>{w}</li>)}</ul></>
            )}
            {d.next_steps.length > 0 && (
              <><h4>Next steps</h4><ul>{d.next_steps.map((w, i) => <li key={i}>{w}</li>)}</ul></>
            )}
          </>
        ) : (
          <p className="verdict-text">This run ended without a recorded decision.</p>
        )}
      </div>
      <h3 className="section-label">Who did what</h3>
      <div className="contribs">
        {review.participants.map((c) => <Contribution key={c.agent} c={c} />)}
      </div>
    </section>
  );
}
