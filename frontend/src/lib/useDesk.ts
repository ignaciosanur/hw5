import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { AgentEvent, ApprovalRequest, Cash, Health, Ticket } from "./types";

export type Connection = "connecting" | "online" | "offline";

const FAST_MS = 1500;  // while any ticket is running
const IDLE_MS = 8000;  // otherwise: keep the board honest without hammering the API

/** Replace state only when the payload actually changed, so polling doesn't re-render the page. */
function useStable<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  const last = useRef<string>("");
  const set = useCallback((next: T) => {
    const key = JSON.stringify(next);
    if (key !== last.current) {
      last.current = key;
      setValue(next);
    }
  }, []);
  return [value, set] as const;
}

export function useDesk(selectedId: number | null) {
  const [tickets, setTickets] = useStable<Ticket[] | null>(null);
  const [cash, setCash] = useStable<Cash | null>(null);
  const [approvals, setApprovals] = useStable<ApprovalRequest[] | null>(null);
  const [health, setHealth] = useStable<Health | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [events, setEvents] = useState<Record<number, AgentEvent[]>>({});
  const [eventsLoaded, setEventsLoaded] = useState<Record<number, boolean>>({});
  const lastSeq = useRef<Record<number, number>>({});
  const resetMarker = useRef<number | null>(null);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.offline) setConnection("offline");
  }, []);

  const refreshBoard = useCallback(async () => {
    try {
      const [t, c, a, h] = await Promise.all([api.tickets(), api.cash(), api.approvals(), api.health()]);
      // A reset from anywhere (CLI, tests, another tab) restarts the feed: drop cached events.
      if (resetMarker.current !== null && h.last_reset_seq !== resetMarker.current) {
        lastSeq.current = {};
        setEvents({});
      }
      resetMarker.current = h.last_reset_seq;
      setTickets(t);
      setCash(c);
      setApprovals(a);
      setHealth(h);
      setConnection("online");
      return t;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [fail, setTickets, setCash, setApprovals, setHealth]);

  /** Fetch only events newer than the last one we hold; merge by seq so nothing duplicates. */
  const refreshEvents = useCallback(async (ticketId: number) => {
    try {
      const fresh = await api.events({ ticketId, afterSeq: lastSeq.current[ticketId] ?? 0 });
      setEventsLoaded((m) => (m[ticketId] ? m : { ...m, [ticketId]: true }));
      if (!fresh.length) return;
      setEvents((all) => {
        const bySeq = new Map((all[ticketId] ?? []).map((e) => [e.seq, e]));
        for (const e of fresh) bySeq.set(e.seq, e);
        const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
        lastSeq.current[ticketId] = merged[merged.length - 1].seq;
        return { ...all, [ticketId]: merged };
      });
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  /** After a reset the feed restarts, so drop every cached event. */
  const clearEvents = useCallback(() => {
    lastSeq.current = {};
    setEvents({});
    setEventsLoaded({});
  }, []);

  const anyRunning = !!tickets?.some((t) => t.running);

  // One polling loop: fast while agents work, slow when idle; always re-arms after the request finishes.
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      await Promise.all([refreshBoard(), selectedId != null ? refreshEvents(selectedId) : null]);
      if (!stopped) timer = window.setTimeout(tick, anyRunning ? FAST_MS : IDLE_MS);
    };
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [selectedId, anyRunning, refreshBoard, refreshEvents]);

  return {
    tickets, cash, approvals, health, connection,
    events: selectedId != null ? events[selectedId] ?? [] : [],
    eventsLoaded: selectedId != null ? !!eventsLoaded[selectedId] : false,
    refreshBoard, refreshEvents, clearEvents,
  };
}
