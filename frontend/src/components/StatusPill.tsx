import { CheckCircle2, CircleDot, Hand, Loader2, OctagonX, PauseCircle, RotateCw, Timer } from "lucide-react";
import { STATE_LABEL, type DeskState } from "../lib/status";

const ICON = {
  running: Loader2, failed: OctagonX, resolved: CheckCircle2, awaiting_approval: Hand,
  approved_rerun: RotateCw, blocked: PauseCircle, in_progress: Timer, open: CircleDot,
} as const;

export function StatusPill({ state, compact = false }: { state: DeskState; compact?: boolean }) {
  const Icon = ICON[state];
  return (
    <span className={`pill pill--${state}${compact ? " pill--compact" : ""}`}>
      <Icon size={13} className={state === "running" ? "spin" : undefined} aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}
