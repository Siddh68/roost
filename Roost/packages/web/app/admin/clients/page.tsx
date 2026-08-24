import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { listAllCompanyProfiles, type DealStatus } from "@roost/orchestrator/db/store";
import { getSessionUser } from "../../../lib/session";

const DEAL_STATUS_STYLE: Record<DealStatus, { label: string; color: string }> = {
  SHORTLISTED: { label: "Shortlisted", color: "var(--text-secondary)" },
  NEGOTIATING: { label: "Negotiating", color: "var(--info)" },
  WON: { label: "Won", color: "var(--accent)" },
  LOST: { label: "Lost", color: "var(--danger)" },
};

export default async function AdminClientsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const clients = await listAllCompanyProfiles();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <div className="flex items-center gap-4">
          <Link href="/admin/landlords" className="text-sm text-[var(--accent)] hover:opacity-80">
            View landlords →
          </Link>
          <Link href="/admin" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            ← Overview
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {clients.length} saved search(es) across all users.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
              <th className="px-4 py-2.5 font-medium">Search</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Team size</th>
              <th className="px-4 py-2.5 font-medium">Budget</th>
              <th className="px-4 py-2.5 font-medium">Preferred area</th>
              <th className="px-4 py-2.5 font-medium">Must-haves</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Deals</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-2.5">{client.label}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{client.ownerEmail}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{client.profile.teamSize}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  ₹{client.profile.budgetInr.toLocaleString("en-IN")}/mo
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{client.profile.preferredArea}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {client.profile.mustHaves.join(", ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {new Date(client.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5">
                  {client.deals.length === 0 ? (
                    <span className="text-[var(--text-secondary)]">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {client.deals.map((deal) => {
                        const style = DEAL_STATUS_STYLE[deal.status] ?? {
                          label: deal.status,
                          color: "var(--text-secondary)",
                        };
                        return (
                          <Link
                            key={deal.id}
                            href={deal.status === "SHORTLISTED" ? `/shortlist/${deal.id}` : `/negotiation/${deal.id}`}
                            className="rounded-full px-2 py-0.5 text-xs font-medium hover:opacity-80"
                            style={{ color: style.color, background: `${style.color}22` }}
                          >
                            {style.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
