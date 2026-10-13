import { agentOf } from "../lib/agents";

/** The Boss is a filled square seal; specialists are tinted circles; "You" is outlined. */
export function AgentAvatar({ agent, size = 28, active = false }: { agent: string; size?: number; active?: boolean }) {
  const a = agentOf(agent);
  const Icon = a.icon;
  return (
    <span
      className={`avatar avatar--${a.tone}${agent === "boss" ? " avatar--boss" : ""}${active ? " is-active" : ""}`}
      style={{ width: size, height: size }}
      title={`${a.name}: ${a.role}`}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2} />
    </span>
  );
}

export function AgentName({ agent }: { agent: string }) {
  const a = agentOf(agent);
  return <span className={`agent-name tone-${a.tone}`}>{a.name}</span>;
}
