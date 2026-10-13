import { CheckCircle2, Info, XCircle } from "lucide-react";

export interface Toast {
  id: number;
  tone: "ok" | "bad" | "info";
  text: string;
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast toast--${t.tone}`} onClick={() => onDismiss(t.id)} aria-label={`${t.text} (dismiss)`}>
          {t.tone === "ok" ? <CheckCircle2 size={16} /> : t.tone === "bad" ? <XCircle size={16} /> : <Info size={16} />}
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}
