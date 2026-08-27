"use client";

import { useEffect, useRef, useState } from "react";
import type { Listing } from "@roost/mcp-server/types";
import type { Deal, NegotiationThread, TranscriptEntry } from "@roost/orchestrator/db/store";
import { TranscriptRow, inr } from "../../../components/TranscriptRow";

// This used to actually drive the negotiation forward (see tick/route.ts's
// history), which justified a fast 6s interval on a single-process backend
// with effectively unlimited local capacity. It's now a pure read-only DB
// refresh — the real driving happens in agent.js's always-on poll-all loop
// regardless of how often this page refreshes — so a slower interval costs
// nothing functionally while meaningfully cutting query volume against a
// free-tier Postgres connection pool shared across every concurrent
// serverless request.
const TICK_INTERVAL_MS = 20000;

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  active: { label: "Negotiating", color: "var(--info)" },
  accepted: { label: "Accepted", color: "var(--accent)" },
  rejected: { label: "Rejected", color: "var(--danger)" },
  // The specific stall reason (round limit vs. no-movement stall) still
  // shows up in the stop_condition transcript row below — the thread
  // status itself only tracks that automated action has stopped.
  escalated: { label: "Escalated", color: "var(--warn)" },
  NEGOTIATING: { label: "Negotiating", color: "var(--info)" },
  WON: { label: "Won", color: "var(--accent)" },
  LOST: { label: "Lost", color: "var(--danger)" },
  SHORTLISTED: { label: "Shortlisted", color: "var(--text-secondary)" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? { label: status, color: "var(--text-secondary)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: style.color, background: `${style.color}1f` }}
    >
      {style.label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

interface DealState {
  deal: Deal;
  threads: NegotiationThread[];
  transcript: TranscriptEntry[];
  listings: Listing[];
}

export default function NegotiationClient({
  dealId,
  initialDeal,
  initialThreads,
  initialTranscript,
  initialListings,
}: {
  dealId: string;
  initialDeal: Deal;
  initialThreads: NegotiationThread[];
  initialTranscript: TranscriptEntry[];
  initialListings: Listing[];
}) {
  const [state, setState] = useState<DealState>({
    deal: initialDeal,
    threads: initialThreads,
    transcript: initialTranscript,
    listings: initialListings,
  });
  const [autoNegotiate, setAutoNegotiate] = useState(true);
  const [ticking, setTicking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // A tick can take longer than the poll interval (Gmail round-trips add up
  // once there's real inbox history) — this ref (checked synchronously,
  // unlike state) stops setInterval from piling up overlapping requests.
  const inFlightRef = useRef(false);

  async function tick() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setTicking(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/tick`, { method: "POST" });
      if (res.ok) setState(await res.json());
    } catch {
      // transient network error — the next interval tick will retry
    } finally {
      inFlightRef.current = false;
      setTicking(false);
    }
  }

  useEffect(() => {
    if (!autoNegotiate || state.deal.status !== "NEGOTIATING") return;
    timerRef.current = setInterval(tick, TICK_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNegotiate, state.deal.status]);

  const listingById = new Map(state.listings.map((l) => [l.id, l]));
  const transcriptByThread = new Map<string, TranscriptEntry[]>();
  for (const entry of state.transcript) {
    const list = transcriptByThread.get(entry.threadId) ?? [];
    list.push(entry);
    transcriptByThread.set(entry.threadId, list);
  }

  const acceptedThreads = state.threads.filter((t) => t.status === "accepted");
  const totalSavings = acceptedThreads.reduce(
    (sum, t) => sum + (t.askingPriceInr - t.currentOfferInr),
    0
  );

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Negotiation</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span>Deal status</span>
            <StatusBadge status={state.deal.status} />
          </div>
        </div>

        {state.deal.status === "NEGOTIATING" && (
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={autoNegotiate}
                onChange={(e) => setAutoNegotiate(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Live updates
            </label>
            <button
              onClick={tick}
              disabled={ticking}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-medium transition hover:border-[var(--accent)]/40 disabled:opacity-50"
            >
              {ticking ? "Refreshing…" : "Refresh now"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <Stat label="Threads" value={`${state.threads.length}`} />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <Stat
            label="Negotiating"
            value={`${state.threads.filter((t) => t.status === "active").length}`}
          />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <Stat label="Accepted" value={`${acceptedThreads.length}`} />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <Stat
            label="Escalated"
            value={`${state.threads.filter((t) => t.status === "escalated").length}`}
          />
        </div>
      </div>

      {acceptedThreads.length > 0 && (
        <div
          className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--accent-dim)] p-5"
          style={{ borderLeft: "3px solid var(--accent)" }}
        >
          <div className="flex items-center gap-2">
            <span>🎉</span>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Deal reached</p>
          </div>
          <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">
            {inr(totalSavings)}
            <span className="text-base font-normal text-[var(--text-secondary)]">/mo saved</span>
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {acceptedThreads
              .map((t) => {
                const l = listingById.get(t.listingId);
                const pct = Math.round((1 - t.currentOfferInr / t.askingPriceInr) * 100);
                return `${l?.title ?? t.listingId}: ${inr(t.askingPriceInr)} → ${inr(t.currentOfferInr)} (${pct}% off asking)`;
              })
              .join(" · ")}
          </p>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {state.threads.map((thread) => {
          const listing = listingById.get(thread.listingId);
          const entries = (transcriptByThread.get(thread.id) ?? []).slice().sort(
            (a, b) => a.timestamp - b.timestamp
          );
          return (
            <div key={thread.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{listing?.title ?? thread.listingId}</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{listing?.area}</p>
                </div>
                <StatusBadge status={thread.status} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-4 sm:max-w-xs">
                <Stat label="Asking" value={inr(thread.askingPriceInr)} />
                <Stat label="Current offer" value={inr(thread.currentOfferInr)} />
                <Stat label="Round" value={`${thread.roundsUsed}`} />
              </div>

              {entries.length > 0 && (
                <div className="mt-4 max-h-72 overflow-y-auto border-t border-[var(--border)] pt-1">
                  {entries.map((entry) => (
                    <TranscriptRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
