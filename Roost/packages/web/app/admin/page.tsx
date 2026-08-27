import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAdminStats } from "@roost/orchestrator/db/store";
import { getSessionUser } from "../../lib/session";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)]/30">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const stats = await getAdminStats();
  const deals = stats.dealsByStatus;
  const negotiations = stats.negotiationsByStatus;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Platform-wide activity across all users.</p>
        </div>
        <Link href="/admin/deals" className="text-sm font-medium text-[var(--accent)] hover:opacity-80">
          View all deals →
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Shortlisted" value={deals.SHORTLISTED ?? 0} />
        <StatCard label="Negotiating" value={deals.NEGOTIATING ?? 0} />
        <StatCard label="Won" value={deals.WON ?? 0} />
      </div>

      <div className="mt-10 border-t border-[var(--border)] pt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Negotiation threads by status
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Active" value={negotiations.ACTIVE ?? 0} />
          <StatCard label="Accepted" value={negotiations.ACCEPTED ?? 0} />
          <StatCard label="Rejected" value={negotiations.REJECTED ?? 0} />
          <StatCard label="Escalated" value={negotiations.ESCALATED ?? 0} />
        </div>
      </div>
    </div>
  );
}
