"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunSearchButton({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/searches/${searchId}/deals`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start a new search run.");
      const { dealId } = await res.json();
      router.push(`/shortlist/${dealId}`);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)]/40 disabled:opacity-50"
    >
      {loading ? "Starting…" : "Run new search"}
    </button>
  );
}
