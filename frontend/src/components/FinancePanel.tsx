import { Ban, Check, Landmark, Loader2, ReceiptText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { agentOf } from "../lib/agents";
import { ApiError } from "../lib/api";
import { APPROVAL_KIND, money, shortDate } from "../lib/format";
import type { ApprovalRequest, Cash } from "../lib/types";
import { AgentAvatar } from "./AgentAvatar";

interface Props {
  cash: Cash | null;
  approvals: ApprovalRequest[] | null;
  offline: boolean;
  focusId: number | null;
  onSelectTicket: (id: number) => void;
  onApprove: (a: ApprovalRequest, approver: string) => Promise<void>;
  onReject: (a: ApprovalRequest, approver: string, reason: string) => Promise<void>;
  onRefreshCash: () => Promise<unknown>;
}

const APPROVER_KEY = "cc-approver-name";

/** The balance briefly highlights when the backend reports a new number. */
function Balance({ value }: { value: number }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"down" | "up" | null>(null);
  useEffect(() => {
    if (value !== prev.current) {
      setFlash(value < prev.current ? "down" : "up");
      prev.current = value;
      const t = window.setTimeout(() => setFlash(null), 1600);
      return () => window.clearTimeout(t);
    }
  }, [value]);
  return <span className={`balance${flash ? ` flash-${flash}` : ""}`}>{money(value)}</span>;
}

function ApprovalCard({ a, cash, offline, focused, onSelectTicket, onApprove, onReject, onRefreshCash }: {
  a: ApprovalRequest; cash: Cash | null; offline: boolean; focused: boolean;
} & Pick<Props, "onSelectTicket" | "onApprove" | "onReject" | "onRefreshCash">) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(() => localStorage.getItem(APPROVER_KEY) ?? "");
  const [reason, setReason] = useState("");
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focused]);

  const balance = cash?.balance ?? null;
  const after = balance == null ? null : Math.round((balance - a.amount) * 100) / 100;
  const insufficient = after != null && after < 0;
  const requester = agentOf(a.requested_by);

  const open = async (m: "approve" | "reject") => {
    setError(null);
    setMode(m);
    if (m === "approve") await onRefreshCash(); // project against the latest balance, not a stale one
  };

  const submit = async () => {
    if (!name.trim()) return setError("Enter your name. It is recorded as the approver.");
    if (mode === "reject" && !reason.trim()) return setError("Say why you're rejecting it.");
    localStorage.setItem(APPROVER_KEY, name.trim());
    setBusy(true);
    setError(null);
    try {
      if (mode === "approve") await onApprove(a, name.trim());
      else await onReject(a, name.trim(), reason.trim());
      setMode("idle");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Nothing was charged.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article ref={ref} className={`approval${focused ? " is-focused" : ""}`} aria-label={`Approval request ${a.id}`}>
      <header className="approval-head">
        <span className="approval-kind">{APPROVAL_KIND[a.kind] ?? a.kind}</span>
        <span className="approval-id">#{a.id}</span>
        {a.ticket_id != null && (
          <button className="link" onClick={() => onSelectTicket(a.ticket_id!)}>ticket #{a.ticket_id}</button>
        )}
      </header>
      <div className="approval-amount">{money(a.amount)}</div>
      <div className="approval-payee">to <strong>{a.payee ?? "payee not on file"}</strong></div>
      {a.description && <p className="approval-desc">{a.description}</p>}
      <p className="approval-reason">
        <AgentAvatar agent={a.requested_by} size={18} /> <span><strong>{requester.name}</strong>: “{a.reason}”</span>
      </p>
      <dl className="projection">
        <div><dt>Checking now</dt><dd>{money(balance)}</dd></div>
        <div><dt>After approval</dt><dd className={insufficient ? "neg" : undefined}>{money(after)}</dd></div>
      </dl>
      {insufficient && <p className="warn">Not enough cash. The backend will refuse this payment.</p>}

      {mode === "idle" ? (
        <div className="approval-actions">
          <button className="btn btn--approve" disabled={offline} onClick={() => open("approve")}>
            <Check size={15} aria-hidden="true" /> Approve
          </button>
          <button className="btn btn--ghost" disabled={offline} onClick={() => open("reject")}>
            <Ban size={15} aria-hidden="true" /> Reject
          </button>
        </div>
      ) : (
        <div className={`confirm confirm--${mode}`}>
          <p className="confirm-q">
            {mode === "approve"
              ? <>Pay <strong>{money(a.amount)}</strong> to <strong>{a.payee ?? "payee"}</strong> from {a.account}? This moves real money in the books.</>
              : <>Reject request #{a.id}? No money moves; the agents will see it was rejected.</>}
          </p>
          <label>Your name (recorded as approver)
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} disabled={busy} />
          </label>
          {mode === "reject" && (
            <label>Reason
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} disabled={busy} />
            </label>
          )}
          {error && <p className="warn" role="alert">{error}</p>}
          <div className="approval-actions">
            <button className={`btn ${mode === "approve" ? "btn--approve" : "btn--danger"}`} onClick={submit}
              disabled={busy || offline || (mode === "approve" && insufficient)}>
              {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
              {busy ? "Processing…" : mode === "approve" ? "Confirm payment" : "Confirm rejection"}
            </button>
            <button className="btn btn--ghost" onClick={() => { setMode("idle"); setError(null); }} disabled={busy}>
              <X size={15} aria-hidden="true" /> Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function FinancePanel(props: Props) {
  const { cash, approvals, offline, focusId } = props;
  const pending = approvals?.filter((a) => a.status === "pending") ?? [];
  const decided = (approvals?.filter((a) => a.status !== "pending") ?? []).slice().reverse();

  return (
    <aside className="finance" aria-label="Cash and approvals">
      <section className="cash-card" aria-live="polite">
        <div className="cash-label"><Landmark size={15} aria-hidden="true" /> {cash ? `${cash.account[0].toUpperCase()}${cash.account.slice(1)}` : "Checking"}</div>
        {cash ? <Balance value={cash.balance} /> : <span className="balance skeleton-text">$0,000.00</span>}
        <div className="cash-sub">
          {cash ? <>Books as of {shortDate(cash.as_of)} · from <code>cash_accounts</code></> : "Loading balance…"}
        </div>
        {cash && cash.pending_approvals_total > 0 && (
          <div className="cash-pending">
            <span>{money(cash.pending_approvals_total)} waiting for approval</span>
            <span>→ {money(cash.balance_if_all_pending_approved)} if all approved</span>
          </div>
        )}
        <p className="cash-note">Cash only moves when you approve a request below.</p>
      </section>

      <section className="approvals" aria-label="Needs your decision">
        <div className="panel-title">
          <h2>Needs your decision</h2>
          {pending.length > 0 && <span className="count count--alert">{pending.length}</span>}
        </div>
        {approvals == null ? (
          <div className="approval approval--skeleton" aria-hidden="true" />
        ) : pending.length === 0 ? (
          <p className="empty-small">No payments waiting. When an agent files one, it shows up here. Nothing is paid until you approve it.</p>
        ) : (
          pending.map((a) => (
            <ApprovalCard key={a.id} a={a} cash={cash} offline={offline} focused={a.id === focusId}
              onSelectTicket={props.onSelectTicket} onApprove={props.onApprove} onReject={props.onReject}
              onRefreshCash={props.onRefreshCash} />
          ))
        )}
      </section>

      <section className="ledger" aria-label="Ledger">
        <div className="panel-title"><h2><ReceiptText size={14} aria-hidden="true" /> Ledger</h2></div>
        {decided.length === 0 ? (
          <p className="empty-small">No payments made yet.</p>
        ) : (
          <ul>
            {decided.map((a) => (
              <li key={a.id} className={`ledger-row is-${a.status}`}>
                <span className="ledger-what">
                  {a.status === "paid" ? <Check size={13} aria-hidden="true" /> : <Ban size={13} aria-hidden="true" />}
                  {a.payee ?? APPROVAL_KIND[a.kind]}
                </span>
                <span className="ledger-amt">{a.status === "paid" ? `−${money(a.amount)}` : "rejected"}</span>
                <span className="ledger-by muted">
                  {APPROVAL_KIND[a.kind]} · request #{a.id}{a.ticket_id ? ` · ticket #${a.ticket_id}` : ""}
                  <br />
                  {a.status === "paid" ? `payment #${a.payment_id} · approved by ${a.decided_by}` : `rejected by ${a.decided_by}: ${a.decision_note ?? ""}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
