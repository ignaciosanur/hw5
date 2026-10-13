import { useCallback, useEffect, useRef, useState } from "react";
import { FinancePanel } from "./components/FinancePanel";
import { Header } from "./components/Header";
import { ResetDialog } from "./components/ResetDialog";
import { TicketQueue } from "./components/TicketQueue";
import { type Toast, Toasts } from "./components/Toasts";
import { Workspace } from "./components/Workspace";
import { api, API_BASE, ApiError } from "./lib/api";
import { money } from "./lib/format";
import type { ApprovalRequest } from "./lib/types";
import { useDesk } from "./lib/useDesk";

const fromHash = () => {
  const n = Number(location.hash.replace("#ticket-", ""));
  return Number.isInteger(n) && n > 0 ? n : null;
};

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(fromHash);
  const desk = useDesk(selectedId);
  const { tickets, cash, approvals, health, connection } = desk;
  const offline = connection === "offline";

  const [starting, setStarting] = useState<number | null>(null);
  const startingRef = useRef(false); // synchronous lock: rapid clicks can't slip in before re-render
  const [focusApproval, setFocusApproval] = useState<number | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  // Default to the first ticket once the board loads; keep the choice in the URL so refresh keeps it.
  useEffect(() => {
    if (tickets?.length && (selectedId == null || !tickets.some((t) => t.id === selectedId))) setSelectedId(tickets[0].id);
  }, [tickets, selectedId]);
  useEffect(() => {
    if (selectedId != null) history.replaceState(null, "", `#ticket-${selectedId}`);
  }, [selectedId]);

  const selected = tickets?.find((t) => t.id === selectedId) ?? null;

  const run = async () => {
    if (!selected || startingRef.current) return; // guard against double clicks before the 202 lands
    startingRef.current = true;
    setStarting(selected.id);
    try {
      const r = await api.runTicket(selected.id);
      toast("info", `Agent team started on ticket #${r.ticket_id} (${r.run_id}).`);
    } catch (e) {
      toast("bad", e instanceof ApiError ? e.message : "Couldn't start the run.");
    } finally {
      await Promise.all([desk.refreshBoard(), desk.refreshEvents(selected.id)]);
      startingRef.current = false;
      setStarting(null);
    }
  };

  const refreshAfterMoney = async (ticketId: number | null) => {
    await desk.refreshBoard();
    if (ticketId != null) await desk.refreshEvents(ticketId);
  };

  const approve = async (a: ApprovalRequest, approver: string) => {
    try {
      const r = await api.approve(a.id, approver);
      toast("ok", `Paid ${money(a.amount)} to ${a.payee ?? "payee"} (payment #${String(r.payment.payment_id)}). Checking is now ${money(r.cash.balance)}.`);
    } catch (e) {
      if (e instanceof ApiError) toast("bad", `Not paid: ${e.message}`);
      throw e;
    } finally {
      await refreshAfterMoney(a.ticket_id); // the backend is the source of truth, success or not
    }
  };

  const reject = async (a: ApprovalRequest, approver: string, reason: string) => {
    try {
      await api.reject(a.id, approver, reason);
      toast("info", `Rejected request #${a.id}. No money moved.`);
    } finally {
      await refreshAfterMoney(a.ticket_id);
    }
  };

  const doReset = async () => {
    setResetBusy(true);
    setResetError(null);
    try {
      const r = await api.reset();
      desk.clearEvents();
      await desk.refreshBoard();
      if (selectedId != null) await desk.refreshEvents(selectedId);
      setResetOpen(false);
      toast("ok", `Demo reset: ${r.tickets.length} tickets open, checking back to ${money(r.cash.balance)}.`);
    } catch (e) {
      setResetError(e instanceof ApiError ? e.message : "Reset failed.");
    } finally {
      setResetBusy(false);
    }
  };

  const showApproval = (id: number) => {
    setFocusApproval(null);
    requestAnimationFrame(() => setFocusApproval(id));
  };

  return (
    <div className="app">
      <Header
        connection={connection}
        booksDate={cash?.as_of ?? null}
        attention={{
          tickets: tickets?.filter((t) => !t.is_resolved).length ?? 0,
          approvals: approvals?.filter((a) => a.status === "pending").length ?? 0,
          running: tickets?.filter((t) => t.running).length ?? 0,
        }}
        resetEnabled={!!health?.reset_enabled}
        onReset={() => { setResetError(null); setResetOpen(true); }}
      />
      {offline && (
        <div className="offline-banner" role="alert">
          Can't reach the API at <code>{API_BASE}</code>. Start it from <code>backend/</code> with{" "}
          <code>uvicorn main:app --reload --port 8000</code>. Values below are the last ones received and may be out of date; actions are disabled.
        </div>
      )}
      <div className={`desk${offline ? " is-stale" : ""}`}>
        <TicketQueue tickets={tickets} selectedId={selectedId} onSelect={setSelectedId} />
        <Workspace
          ticket={selected}
          events={desk.events}
          eventsLoaded={desk.eventsLoaded}
          approvals={approvals ?? []}
          starting={starting === selectedId}
          offline={offline}
          onRun={run}
          onShowApproval={showApproval}
        />
        <FinancePanel
          cash={cash}
          approvals={approvals}
          offline={offline}
          focusId={focusApproval}
          onSelectTicket={setSelectedId}
          onApprove={approve}
          onReject={reject}
          onRefreshCash={desk.refreshBoard}
        />
      </div>
      <ResetDialog open={resetOpen} busy={resetBusy} error={resetError} onCancel={() => setResetOpen(false)} onConfirm={doReset} />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
