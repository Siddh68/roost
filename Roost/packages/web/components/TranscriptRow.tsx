"use client";

import type { TranscriptEntry } from "@roost/orchestrator/db/store";

export function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function TranscriptRow({ entry }: { entry: TranscriptEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const p = entry.payload as Record<string, any>;

  switch (entry.type) {
    case "outreach_sent":
      return (
        <Row time={time} kind="Outreach sent" kindColor="var(--info)">
          <p className="whitespace-pre-wrap text-[var(--text-secondary)]">{p.body}</p>
        </Row>
      );
    case "reply_received":
      return (
        <Row time={time} kind="Reply received" kindColor="var(--info)">
          <p className="text-[var(--text-secondary)]">
            From {p.from} — &ldquo;{p.snippet}&rdquo;
          </p>
        </Row>
      );
    case "intent_classified":
      return (
        <Row time={time} kind="Reply classified" kindColor="var(--text-secondary)">
          <p>
            Model read tone as <b>{p.toneLabel}</b>
            {p.corrected && <span className="text-[var(--warn)]"> (self-corrected)</span>} · intent{" "}
            <b>{p.intent}</b>
            {p.offeredPriceInr != null && <> · price {inr(p.offeredPriceInr)}</>} · confidence{" "}
            {(p.modelConfidence * 100).toFixed(0)}%
          </p>
        </Row>
      );
    case "policy_decision":
      if (p.action === "concession_model_update") {
        return (
          <Row time={time} kind="Model updated" kindColor="var(--warn)">
            <p className="text-[var(--text-secondary)]">{p.reasoning}</p>
          </Row>
        );
      }
      return (
        <Row time={time} kind="Policy decision" kindColor="var(--text-secondary)">
          <p className="text-[var(--text-secondary)]">{p.reasoning}</p>
        </Row>
      );
    case "response_sent":
      return (
        <Row time={time} kind="Sent reply" kindColor="var(--accent)">
          <p className="whitespace-pre-wrap text-[var(--text-secondary)]">{p.body}</p>
        </Row>
      );
    case "stop_condition":
      return (
        <Row time={time} kind="Stopped" kindColor="var(--danger)">
          <p className="text-[var(--text-secondary)]">{p.reasoning}</p>
        </Row>
      );
    default:
      return null;
  }
}

export function Row({
  time,
  kind,
  kindColor,
  children,
}: {
  time: string;
  kind: string;
  kindColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 py-2 pl-3 text-xs" style={{ borderColor: kindColor }}>
      <div className="mb-0.5 flex items-center gap-2">
        <span className="font-medium" style={{ color: kindColor }}>
          {kind}
        </span>
        {/* toLocaleTimeString() can differ between the server's and the
            browser's locale/timezone — this is server-rendered once then
            hydrated, so a literal mismatch here is expected and harmless. */}
        <span className="text-[var(--text-secondary)]" suppressHydrationWarning>
          {time}
        </span>
      </div>
      {children}
    </div>
  );
}
