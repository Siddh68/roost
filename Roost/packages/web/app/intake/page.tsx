"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MUST_HAVE_OPTIONS = [
  { value: "metro", label: "Near metro" },
  { value: "cab", label: "Cab availability" },
  { value: "parking", label: "Parking" },
  { value: "furnished", label: "Furnished" },
  { value: "meetingRooms", label: "Meeting rooms" },
  { value: "access24x7", label: "24/7 access" },
  { value: "highSpeedInternet", label: "High-speed internet" },
] as const;

const AREA_OPTIONS = [
  "BKC", "Nariman Point", "Lower Parel", "Worli", "Andheri East",
  "Andheri West", "Powai", "Goregaon East", "Malad West", "Vikhroli",
  "Thane West", "Vashi", "Chembur", "Ghatkopar East", "Mulund West",
  "Prabhadevi",
];

export default function IntakePage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [teamSize, setTeamSize] = useState(25);
  const [customTeamSize, setCustomTeamSize] = useState(false);
  const [customBudget, setCustomBudget] = useState(false);
  const [budgetInr, setBudgetInr] = useState(250000);
  const [preferredArea, setPreferredArea] = useState(AREA_OPTIONS[0]);
  const [mustHaves, setMustHaves] = useState<string[]>(["metro", "furnished"]);
  const [priceFloorPct, setPriceFloorPct] = useState(0.85);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleMustHave(value: string) {
    setMustHaves((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, teamSize, budgetInr, preferredArea, mustHaves, priceFloorPct }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create search.");
      const { dealId } = await res.json();
      router.push(`/shortlist/${dealId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Find your next office</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Tell us about your company and we&apos;ll search, score, and start negotiating on your behalf.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="mb-3 text-sm font-semibold">Basics</h2>
          <Field label="Search name">
            <input
              type="text"
              placeholder="e.g. Mumbai HQ search"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="mb-4 text-sm font-semibold">Team &amp; budget</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <SliderStat label="Team size" value={`${teamSize} people`}>
              {customTeamSize ? (
                <>
                  <input
                    type="number"
                    min={1}
                    required
                    value={teamSize}
                    onChange={(e) => setTeamSize(Number(e.target.value))}
                    className="input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTeamSize(false);
                      setTeamSize((v) => Math.min(v, 200));
                    }}
                    className="mt-1.5 text-xs text-[var(--accent)] hover:underline"
                  >
                    Back to slider
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="range"
                    min={1}
                    max={200}
                    step={1}
                    value={teamSize}
                    onChange={(e) => setTeamSize(Number(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                  {teamSize >= 200 && (
                    <button
                      type="button"
                      onClick={() => setCustomTeamSize(true)}
                      className="mt-1.5 text-xs text-[var(--accent)] hover:underline"
                    >
                      Larger team? Enter custom size
                    </button>
                  )}
                </>
              )}
            </SliderStat>

            <SliderStat label="Monthly budget" value={`₹${budgetInr.toLocaleString("en-IN")}`}>
              {customBudget ? (
                <>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    required
                    value={budgetInr}
                    onChange={(e) => setBudgetInr(Number(e.target.value))}
                    className="input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCustomBudget(false);
                      setBudgetInr((v) => Math.min(v, 1500000));
                    }}
                    className="mt-1.5 text-xs text-[var(--accent)] hover:underline"
                  >
                    Back to slider
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="range"
                    min={10000}
                    max={1500000}
                    step={5000}
                    value={budgetInr}
                    onChange={(e) => setBudgetInr(Number(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                  {budgetInr >= 1500000 && (
                    <button
                      type="button"
                      onClick={() => setCustomBudget(true)}
                      className="mt-1.5 text-xs text-[var(--accent)] hover:underline"
                    >
                      Higher budget? Enter exact amount
                    </button>
                  )}
                </>
              )}
            </SliderStat>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="mb-4 text-sm font-semibold">Location &amp; must-haves</h2>
          <div className="space-y-4">
            <Field label="Preferred area">
              <select
                value={preferredArea}
                onChange={(e) => setPreferredArea(e.target.value)}
                className="input"
              >
                {AREA_OPTIONS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </Field>

            <div>
              <p className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Must-haves</p>
              <div className="grid grid-cols-2 gap-2">
                {MUST_HAVE_OPTIONS.map((opt) => {
                  const checked = mustHaves.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition"
                      style={{
                        borderColor: checked ? "color-mix(in srgb, var(--accent) 50%, transparent)" : "var(--border)",
                        background: checked ? "var(--accent-dim)" : "var(--surface-raised)",
                        color: checked ? "var(--accent)" : "var(--text-primary)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMustHave(opt.value)}
                        className="accent-[var(--accent)]"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-dim)] p-5">
          <div className="flex items-center gap-2">
            <span>🪺</span>
            <p className="text-xs font-semibold text-[var(--accent)]">AI negotiation strategy</p>
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Offers below this are treated as suspiciously cheap and sanity-checked rather than grabbed outright.
          </p>

          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">Negotiation floor</p>
            <p className="mt-0.5 text-lg font-semibold text-[var(--accent)]">
              {Math.round(priceFloorPct * 100)}% of budget
            </p>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              value={priceFloorPct}
              onChange={(e) => setPriceFloorPct(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--accent)]"
            />
          </div>
        </div>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#06210f] transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Searching listings…" : "Search & score listings"}
        </button>
      </form>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          background: var(--surface-raised);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--text-primary);
        }
        .input:focus {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{label}</label>
      {children}
    </div>
  );
}

function SliderStat({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
