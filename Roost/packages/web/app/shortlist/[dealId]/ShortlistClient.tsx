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

// --- small inline icons, matching Sidebar.tsx's style (no external icon font) ---

function WifiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9a13 13 0 0 1 16 0M7 12.5a8.5 8.5 0 0 1 10 0M10.2 16a4 4 0 0 1 3.6 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="19" r="1.1" fill="currentColor" />
    </svg>
  );
}
function CoffeeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function CafeteriaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4v7M4 4v3.5a2 2 0 0 0 4 0V4M9 4v16M17 4c-2 0-3 2-3 5s1 3 3 3v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MeetingRoomsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="9" r="1.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 19c0-3 2.2-5 5-5s5 2 5 5M15 19c0-2.2 1.3-4 3.5-4S22 16.8 22 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function AccessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ParkingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 16V8h2.7a2.5 2.5 0 0 1 0 5H9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TrainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="4" width="14" height="12" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 12h14M9 16l-2 4M15 16l2 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
      <circle cx="15" cy="9" r="1" fill="currentColor" />
    </svg>
  );
}
function CafeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v3M8 3v3M16 3v3M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
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
  const [viewing, setViewing] = useState<ScoredListing | null>(null);

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

  if (viewing) {
    return (
      <ListingDetail
        scored={viewing}
        selected={selected.has(viewing.listing.id)}
        onBack={() => setViewing(null)}
        onSelectAndBack={() => {
          toggle(viewing.listing.id);
          setViewing(null);
        }}
      />
    );
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
              Max rent: {inr(maxBudget)}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((s, i) => (
          <div
            key={s.listing.id}
            className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--accent)]/40"
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.listing.photoUrl} alt="" className="h-40 w-full object-cover" loading="lazy" />
              <div
                className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold backdrop-blur"
                style={{
                  background: "color-mix(in srgb, var(--background) 65%, transparent)",
                  border: `2px solid ${scoreColor(s.score.totalScore)}`,
                  color: scoreColor(s.score.totalScore),
                }}
                title="Fit score"
              >
                {s.score.totalScore}
              </div>
              <label
                className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full backdrop-blur"
                style={{ background: "color-mix(in srgb, var(--background) 65%, transparent)" }}
                title="Select for negotiation"
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.listing.id)}
                  onChange={() => toggle(s.listing.id)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </label>
            </div>

            <div className="flex flex-1 flex-col p-4">
              <h3 className="truncate text-sm font-medium">
                #{i + 1} {s.listing.title}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {s.listing.area} · {s.listing.seats} seats · floor {s.listing.floor}
                {s.listing.furnished ? " · furnished" : ""}
              </p>
              <p className="mt-2 text-base font-semibold">
                {inr(s.listing.monthlyRentInr)}
                <span className="text-xs font-normal text-[var(--text-secondary)]">/mo</span>
              </p>

              <button
                onClick={() => setViewing(s)}
                className="mt-3 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-[#06210f] transition hover:opacity-90"
              >
                View Details
              </button>
            </div>
          </div>
        ))}

        {visible.length === 0 && (
          <p className="col-span-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-secondary)]">
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

function Amenity({ Icon, label }: { Icon: () => React.ReactElement; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs">
      <span className="text-[var(--accent)]">
        <Icon />
      </span>
      {label}
    </div>
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

function ListingDetail({
  scored,
  selected,
  onBack,
  onSelectAndBack,
}: {
  scored: ScoredListing;
  selected: boolean;
  onBack: () => void;
  onSelectAndBack: () => void;
}) {
  const { listing, score } = scored;

  const amenities: { Icon: () => React.ReactElement; label: string }[] = [
    ...(listing.highSpeedInternet ? [{ Icon: WifiIcon, label: "High-speed internet" }] : []),
    ...(listing.meetingRooms ? [{ Icon: MeetingRoomsIcon, label: "Meeting rooms" }] : []),
    ...(listing.coffeeMachine ? [{ Icon: CoffeeIcon, label: "Coffee machine" }] : []),
    ...(listing.cafeteriaOnSite ? [{ Icon: CafeteriaIcon, label: "On-site cafeteria" }] : []),
    ...(listing.access24x7 ? [{ Icon: AccessIcon, label: "24/7 access" }] : []),
    ...(listing.parkingType !== "none"
      ? [{ Icon: ParkingIcon, label: `${listing.parkingType[0].toUpperCase()}${listing.parkingType.slice(1)} parking` }]
      : []),
  ];

  return (
    <div className="mt-6 pb-10">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        ← Back to shortlist
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={listing.photoUrl} alt="" className="h-80 w-full rounded-xl object-cover" />

          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{listing.title}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {listing.area} · floor {listing.floor} · {listing.walkingTimeToStationMinutes} min walk to nearest station
          </p>

          <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-sm font-semibold">About this space</h2>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{listing.description}</p>
          </div>

          {amenities.length > 0 && (
            <div className="mt-5">
              <h2 className="mb-2 text-sm font-semibold">Amenities</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {amenities.map((a) => (
                  <Amenity key={a.label} Icon={a.Icon} label={a.label} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">Monthly rent</p>
            <p className="mt-0.5 text-2xl font-semibold text-[var(--accent)]">{inr(listing.monthlyRentInr)}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Team size" value={`${listing.seats} seats`} />
              <Stat label="Furnished" value={listing.furnished ? "Yes" : "No"} />
              <Stat
                label="Walk to station"
                value={`${listing.walkingTimeToStationMinutes} min`}
              />
              <Stat label="Nearby cafes" value={`${listing.nearbyCafesRestaurants}`} />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-dim)] p-4">
            <div className="flex items-center gap-2">
              <span>🪺</span>
              <p className="text-xs font-semibold text-[var(--accent)]">Roost AI Agent analysis</p>
            </div>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">{score.reasoning}</p>
            <div className="mt-3 space-y-1.5">
              <Bar label="Cost" value={score.breakdown.costEfficiency} />
              <Bar label="Commute" value={score.breakdown.commute} />
              <Bar label="Amenity" value={score.breakdown.amenityFit} />
            </div>
          </div>

          <button
            onClick={onSelectAndBack}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition"
            style={
              selected
                ? { background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-primary)" }
                : { background: "var(--accent)", color: "#06210f" }
            }
          >
            {selected ? "Remove from negotiation list" : "Start Negotiation with AI"}
          </button>
        </div>
      </div>
    </div>
  );
}
