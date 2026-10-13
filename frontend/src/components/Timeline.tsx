import { AlertTriangle, ArrowRight, BadgeCheck, CornerDownLeft, Flag, Hand, OctagonX, Play, Plug, XCircle } from "lucide-react";
import { type CSSProperties, memo, useState } from "react";
import { agentOf } from "../lib/agents";
import { clock } from "../lib/format";
import { callSignature, type FeedItem } from "../lib/feed";
import { AgentAvatar, AgentName } from "./AgentAvatar";

function ToolRow({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false);
  const t = item.tool!;
  return (
    <div className={`tool${item.kind === "approval_requested" ? " tool--request" : ""}`}>
      <button className="tool-call" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Plug size={13} aria-hidden="true" />
        <span className="mcp-tag">MCP</span>
        <code>{callSignature(t.name, t.args)}</code>
      </button>
      <div className={`tool-result${t.pending ? " is-pending" : ""}`}>
        <CornerDownLeft size={13} aria-hidden="true" />
        {t.pending ? <span className="shimmer">waiting for result…</span> : <span>{t.resultText || "result received"}</span>}
      </div>
      {open && (
        <pre className="raw">{JSON.stringify({ args: t.args, result: t.result ?? null }, null, 2)}</pre>
      )}
    </div>
  );
}

const Row = memo(function Row({ item }: { item: FeedItem }) {
  const a = agentOf(item.agent);
  const indent = { "--depth": item.depth } as CSSProperties;

  if (item.kind === "run_start")
    return (
      <li className="feed-row feed-row--system">
        <Play size={14} aria-hidden="true" /> <strong>Agent team started</strong>
        <span className="muted"> · run {item.runId}</span>
        <time>{clock(item.ts)}</time>
      </li>
    );
  if (item.kind === "run_done" || item.kind === "run_failed")
    return (
      <li className={`feed-row feed-row--end ${item.kind === "run_done" ? "is-ok" : "is-bad"}`}>
        {item.kind === "run_done" ? <Flag size={15} aria-hidden="true" /> : <OctagonX size={15} aria-hidden="true" />}
        <strong>{item.title}</strong>
        {item.decision && <span className="muted"> · Boss set status “{item.decision.status.replace("_", " ")}”</span>}
        <time>{clock(item.ts)}</time>
        {item.kind === "run_failed" && <p className="feed-body">{item.body}</p>}
      </li>
    );

  const icon =
    item.kind === "delegation" ? <ArrowRight size={13} aria-hidden="true" /> :
    item.kind === "approval_requested" ? <Hand size={13} aria-hidden="true" /> :
    item.kind === "refused" ? <AlertTriangle size={13} aria-hidden="true" /> :
    item.kind === "error" ? <XCircle size={13} aria-hidden="true" /> :
    item.kind === "human_approval" ? <BadgeCheck size={13} aria-hidden="true" /> : null;

  return (
    <li className={`feed-row feed-row--${item.kind} tone-${a.tone}`} style={indent}>
      <AgentAvatar agent={item.agent} size={item.agent === "boss" ? 30 : 26} />
      <div className="feed-main">
        <div className="feed-head">
          <AgentName agent={item.agent} />
          <span className="feed-verb">{icon}{item.title}</span>
          {item.toAgent && <AgentName agent={item.toAgent} />}
          <time>{clock(item.ts)}</time>
        </div>
        {item.tool && <ToolRow item={item} />}
        {item.body && <p className="feed-body">{item.body}</p>}
      </div>
    </li>
  );
});

export function Timeline({ items }: { items: FeedItem[] }) {
  return (
    <ol className="feed" aria-label="Agent activity">
      {items.map((it) => <Row key={it.key} item={it} />)}
    </ol>
  );
}
