"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Listing, ScoreResult } from "@roost/mcp-server/types";

interface ScoredListing {
  listing: Listing;
  score: ScoreResult;
}

type SortKey = "score" | "rent" | "commute";

function scoreColor(score: number): string {
  if (score >= 65) return "var(--accent)";
  if (score >= 45) return "var(--warn)";
  return "var(--danger)";
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-[var(--text-secondary)]">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-raised)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: scoreColor(value) }}
        />
      </div>
      <span className="w-8 text-right text-[var(--text-secondary)]">{Math.round(value)}</span>
    </div>
  );
}

export default function ShortlistClient({
  dealId,
  scored,
}: {
  dealId: string;
  scored: ScoredListing[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(scored.slice(0, 3).map((s) => s.listing.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxRentInData = Math.max(...scored.map((s) => s.listing.monthlyRentInr), 0);
  const floors = useMemo(
    () => [...new Set(scored.map((s) => s.listing.floor))].sort((a, b) => a - b),
    [scored]
  );

  const [maxBudget, setMaxBudget] = useState(maxRentInData);
  const [floorFilter, setFloorFilter] = useState<"any" | number>("any");
  const [furnishedOnly, setFurnishedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visible = useMemo(() => {
    const filtered = scored.filter((s) => {
      if (s.listing.monthlyRentInr > maxBudget) return false;
      if (floorFilter !== "any" && s.listing.floor !== floorFilter) return false;
      if (furnishedOnly && !s.listing.furnished) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "rent") return a.listing.monthlyRentInr - b.listing.monthlyRentInr;
      if (sortBy === "commute") return b.score.breakdown.commute - a.score.breakdown.commute;
      return b.score.totalScore - a.score.totalScore;
    });
    return sorted;
  }, [scored, maxBudget, floorFilter, furnishedOnly, sortBy]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function startNegotiation() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingIds: [...selected] }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to send outreach.");
      router.push(`/negotiation/${dealId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <span>{filtersOpen ? "▾" : "▸"}</span> Filters & sort
        </button>
        <span className="text-xs text-[var(--text-secondary)]">
          {visible.length} of {scored.length} shown
        </span>
      </div>

      {filtersOpen && (
        <div className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Max rent: ₹{maxBudget.toLocaleString("en-IN")}
            </label>
            <input
              type="range"
              min={0}
              max={maxRentInData}
              step={5000}
              value={maxBudget}
              onChange={(e) => setMaxBudget(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Floor</label>
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value === "any" ? "any" : Number(e.target.value))}
              className="filter-select"
            >
              <option value="any">Any floor</option>
              {floors.map((f) => (
                <option key={f} value={f}>
                  Floor {f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={furnishedOnly}
                onChange={(e) => setFurnishedOnly(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Furnished only
            </label>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Sort by</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className="filter-select">
              <option value="score">Best fit score</option>
              <option value="rent">Lowest rent</option>
              <option value="commute">Closest to metro</option>
            </select>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((s, i) => (
          <label
            key={s.listing.id}
            className="flex cursor-pointer gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]/40"
          >
            <input
              type="checkbox"
              checked={selected.has(s.listing.id)}
              onChange={() => toggle(s.listing.id)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.listing.photoUrl}
              alt=""
              className="h-20 w-28 shrink-0 rounded-lg object-cover"
              loading="lazy"
            />

            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{
                border: `2px solid ${scoreColor(s.score.totalScore)}`,
                color: scoreColor(s.score.totalScore),
              }}
            >
              {s.score.totalScore}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="truncate font-medium">
                  #{i + 1} {s.listing.title}
                </h3>
                <span className="shrink-0 text-sm text-[var(--text-secondary)]">
                  ₹{s.listing.monthlyRentInr.toLocaleString("en-IN")}/mo
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {s.listing.area} · {s.listing.seats} seats · floor {s.listing.floor}
                {s.listing.furnished ? " · furnished" : ""}
                {s.listing.parking ? " · parking" : ""}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{s.listing.description}</p>

              <div className="mt-3 grid max-w-sm grid-cols-1 gap-1">
                <Bar label="Cost" value={s.score.breakdown.costEfficiency} />
                <Bar label="Commute" value={s.score.breakdown.commute} />
                <Bar label="Amenity" value={s.score.breakdown.amenityFit} />
              </div>

              <p className="mt-2 text-xs text-[var(--text-secondary)]">{s.score.reasoning}</p>
            </div>
          </label>
        ))}

        {visible.length === 0 && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-secondary)]">
            No listings match these filters — try loosening them.
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="text-sm text-[var(--text-secondary)]">
            {selected.size} listing{selected.size === 1 ? "" : "s"} selected
            {error && <span className="ml-3 text-[var(--danger)]">{error}</span>}
          </div>
          <button
            onClick={startNegotiation}
            disabled={selected.size === 0 || submitting}
            className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#06210f] transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Sending outreach…" : `Start negotiation with ${selected.size}`}
          </button>
        </div>
      </div>

      <style>{`
        .filter-select {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          background: var(--surface-raised);
          padding: 0.4rem 0.6rem;
          font-size: 0.8rem;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
