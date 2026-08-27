import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { listAllDeals, type DealWithMeta } from "@roost/orchestrator/db/store";
import { getSessionUser } from "../../../lib/session";

const DEAL_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  SHORTLISTED: { label: "Shortlisted", color: "var(--text-secondary)" },
  NEGOTIATING: { label: "Negotiating", color: "var(--info)" },
  WON: { label: "Won", color: "var(--accent)" },
  LOST: { label: "Lost", color: "var(--danger)" },
};

function dealHref(deal: DealWithMeta): string {
  return deal.status === "SHORTLISTED" ? `/shortlist/${deal.id}` : `/negotiation/${deal.id}`;
}

export default async function AdminDealsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const deals = await listAllDeals();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All deals</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{deals.length} deal(s) across all users.</p>
        </div>
        <Link href="/admin" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          ← Overview
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              <th className="px-4 py-3 font-medium">Search</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const style = DEAL_STATUS_STYLE[deal.status] ?? { label: deal.status, color: "var(--text-secondary)" };
              return (
                <tr
                  key={deal.id}
                  className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-raised)]"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link href={dealHref(deal)} className="hover:text-[var(--accent)]">
                      {deal.label}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{deal.ownerEmail}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {new Date(deal.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    ₹{deal.companyProfile.budgetInr.toLocaleString("en-IN")}/mo
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        color: style.color,
                        background: `${style.color}1a`,
                        border: `1px solid ${style.color}33`,
                      }}
                    >
                      {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
