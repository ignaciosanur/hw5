import { type KeyboardEvent, useRef } from "react";
import { TICKET_KIND } from "../lib/format";
import { deskState } from "../lib/status";
import type { Ticket } from "../lib/types";
import { StatusPill } from "./StatusPill";

interface Props {
  tickets: Ticket[] | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const NEEDS_YOU = new Set(["awaiting_approval", "failed", "approved_rerun"]);

export function TicketQueue({ tickets, selectedId, onSelect }: Props) {
  const list = useRef<HTMLDivElement>(null);

  // Up/Down moves between tickets like a list box.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!tickets || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowDown" ? 1 : -1) + tickets.length) % tickets.length;
    onSelect(tickets[next].id);
    list.current?.querySelectorAll<HTMLButtonElement>("button.ticket")[next]?.focus();
  };

  return (
    <nav className="queue" aria-label="Ticket queue">
      <div className="panel-title">
        <h2>Ticket queue</h2>
        {tickets && <span className="count">{tickets.filter((t) => !t.is_resolved).length} open</span>}
      </div>
      <div className="queue-list" ref={list}>
        {!tickets &&
          [0, 1, 2].map((i) => <div key={i} className="ticket ticket--skeleton" aria-hidden="true" />)}
        {tickets?.map((t, i) => {
          const state = deskState(t);
          const outcome = t.last_run?.decision?.decision ?? (t.last_run?.status === "failed" ? t.last_run.error : null);
          return (
            <button
              key={t.id}
              className={`ticket ticket--${state}${t.id === selectedId ? " is-selected" : ""}`}
              aria-current={t.id === selectedId ? "true" : undefined}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="ticket-top">
                <span className="ticket-id">#{t.id}</span>
                <span className="ticket-kind">{TICKET_KIND[t.type] ?? t.type}</span>
                {NEEDS_YOU.has(state) && <span className="needs-you" title="Needs a human">●</span>}
              </span>
              <span className="ticket-subject">{t.subject}</span>
              <span className="ticket-requester">{t.requester}</span>
              <StatusPill state={state} compact />
              {outcome && <span className="ticket-outcome">{outcome}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
