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
  "Koramangala", "Indiranagar", "HSR Layout", "Whitefield", "MG Road",
  "Electronic City", "Jayanagar", "JP Nagar", "Marathahalli", "Bellandur",
  "Sarjapur Road", "BTM Layout", "Malleshwaram", "Rajajinagar", "Yelahanka",
  "Hebbal", "Domlur", "CV Raman Nagar", "Banashankari", "Vijayanagar",
  "BKC", "Nariman Point", "Lower Parel", "Worli", "Andheri East",
  "Andheri West", "Powai", "Goregaon East", "Malad West", "Vikhroli",
  "Thane West", "Vashi", "Chembur", "Ghatkopar East", "Mulund West",
  "Prabhadevi",
];

export default function IntakePage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [teamSize, setTeamSize] = useState(25);
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
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Find your next office</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Tell us about your company and we&apos;ll search, score, and start negotiating on your behalf.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <Field label="Search name">
          <input
            type="text"
            placeholder="e.g. Bengaluru HQ search"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Team size">
            <SliderWithInput
              min={1}
              max={200}
              step={1}
              value={teamSize}
              onChange={setTeamSize}
            />
          </Field>
          <Field label="Monthly budget (₹)">
            <SliderWithInput
              min={10000}
              max={1500000}
              step={5000}
              value={budgetInr}
              onChange={setBudgetInr}
              formatValue={(v) => `₹${v.toLocaleString("en-IN")}`}
            />
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Drag to explore, or type an exact figure — negotiation runs against this precise number, not a range.
            </p>
          </Field>
        </div>

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

        <Field label="Must-haves">
          <div className="grid grid-cols-2 gap-2">
            {MUST_HAVE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={mustHaves.includes(opt.value)}
                  onChange={() => toggleMustHave(opt.value)}
                  className="accent-[var(--accent)]"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </Field>

        <Field label={`Negotiation floor: ${Math.round(priceFloorPct * 100)}% of budget`}>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.01}
            value={priceFloorPct}
            onChange={(e) => setPriceFloorPct(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Offers below this are treated as suspiciously cheap and sanity-checked rather than grabbed outright.
          </p>
        </Field>

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
          background: var(--surface);
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

function SliderWithInput({
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(Math.max(value, min), max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      <input
        type="number"
        min={min}
        step={step}
        required
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input w-28 shrink-0 text-right"
      />
      {formatValue && (
        <span className="sr-only">{formatValue(value)}</span>
      )}
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
