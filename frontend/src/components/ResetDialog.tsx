import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetDialog({ open, busy, error, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="reset-title" onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id="reset-title"><RotateCcw size={18} aria-hidden="true" /> Reset the demo?</h2>
      <p>This restores the shop database to its original seeded state:</p>
      <ul>
        <li>all three tickets go back to <strong>open</strong></li>
        <li>pending and completed payments are cleared, and checking returns to its seeded balance</li>
        <li>customer drafts are deleted</li>
        <li>the activity feed starts fresh (the audit trail file keeps the history)</li>
      </ul>
      <p className="muted">Development only. This can't be undone.</p>
      {error && <p className="warn" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="btn btn--ghost" onClick={onCancel} disabled={busy} autoFocus>Cancel</button>
        <button className="btn btn--danger" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
          {busy ? "Resetting…" : "Yes, reset demo data"}
        </button>
      </div>
    </dialog>
  );
}
