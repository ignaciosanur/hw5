import { MoreHorizontal, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Connection } from "../lib/useDesk";
import { shortDate } from "../lib/format";

interface Props {
  connection: Connection;
  booksDate: string | null;
  attention: { tickets: number; approvals: number; running: number };
  resetEnabled: boolean;
  onReset: () => void;
}

export function Header({ connection, booksDate, attention, resetEnabled, onReset }: Props) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="seal" aria-hidden="true">CC</span>
        <div>
          <div className="brand-name">Campus Customs</div>
          <div className="brand-sub">Operations Desk · Chapel Street, New Haven</div>
        </div>
      </div>

      <div className="status-strip" aria-live="polite">
        <span className="strip-item"><strong>{attention.tickets}</strong> open ticket{attention.tickets === 1 ? "" : "s"}</span>
        <span className={`strip-item${attention.running ? " is-live" : ""}`}><strong>{attention.running}</strong> running</span>
        <span className={`strip-item${attention.approvals ? " is-alert" : ""}`}><strong>{attention.approvals}</strong> awaiting you</span>
        {booksDate && <span className="strip-item muted">Shop date {shortDate(booksDate)}</span>}
      </div>

      <div className="topbar-right">
        <span className={`conn conn--${connection}`}>
          <span className="conn-dot" aria-hidden="true" />
          {connection === "online" ? "API connected" : connection === "offline" ? "API unreachable" : "Connecting…"}
        </span>
        {resetEnabled && (
          <div className="menu" ref={menuRef}>
            <button className="icon-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div className="menu-pop" role="menu">
                <button role="menuitem" onClick={() => { setMenu(false); onReset(); }} disabled={connection !== "online"}>
                  <RotateCcw size={14} aria-hidden="true" /> Reset demo…
                  <span className="menu-note">Dev only</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
