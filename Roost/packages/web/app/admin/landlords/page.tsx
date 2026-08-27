import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { listAllLandlords, type ThreadStatus } from "@roost/orchestrator/db/store";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import { getSessionUser } from "../../../lib/session";

const THREAD_STATUS_STYLE: Record<ThreadStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "var(--info)" },
  accepted: { label: "Accepted", color: "var(--accent)" },
  rejected: { label: "Rejected", color: "var(--danger)" },
  escalated: { label: "Escalated", color: "var(--text-secondary)" },
};

export default async function AdminLandlordsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const landlords = await listAllLandlords();
  const listingsById = new Map(loadListings().map((l) => [l.id, l]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Landlords</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {landlords.length} distinct landlord contact(s) across all negotiations.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/clients" className="text-sm font-medium text-[var(--accent)] hover:opacity-80">
            View clients →
          </Link>
          <Link href="/admin" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            ← Overview
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              <th className="px-4 py-3 font-medium">Landlord email</th>
              <th className="px-4 py-3 font-medium">Threads</th>
              <th className="px-4 py-3 font-medium">Status breakdown</th>
              <th className="px-4 py-3 font-medium">Listings contacted about</th>
            </tr>
          </thead>
          <tbody>
            {landlords.map((landlord) => (
              <tr
                key={landlord.email}
                className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-raised)]"
              >
                <td className="px-4 py-3 font-medium">{landlord.email}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{landlord.threadCount}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(landlord.statusCounts) as ThreadStatus[])
                      .filter((status) => landlord.statusCounts[status] > 0)
                      .map((status) => {
                        const style = THREAD_STATUS_STYLE[status];
                        return (
                          <span
                            key={status}
                            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                            style={{
                              color: style.color,
                              background: `${style.color}1a`,
                              border: `1px solid ${style.color}33`,
                            }}
                          >
                            {style.label} × {landlord.statusCounts[status]}
                          </span>
                        );
                      })}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">
                  {landlord.listingIds
                    .map((id) => listingsById.get(id)?.title ?? id)
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
