import Link from "next/link";
import { redirect } from "next/navigation";
import { listDealsByUser, type DealWithMeta } from "@roost/orchestrator/db/store";
import { getSessionUser } from "../../lib/session";

const DEAL_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  SHORTLISTED: { label: "Shortlisted", color: "var(--text-secondary)" },
  NEGOTIATING: { label: "Negotiating", color: "var(--info)" },
  WON: { label: "Won", color: "var(--accent)" },
  LOST: { label: "Lost", color: "var(--danger)" },
};

function dealHref(deal: DealWithMeta): string {
  return deal.status === "SHORTLISTED" ? `/shortlist/${deal.id}` : `/negotiation/${deal.id}`;
}

export default async function HistoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const deals = await listDealsByUser(user.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Deal history</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Every search run across all your saved searches, most recent first.
      </p>

      {deals.length === 0 ? (
        <div className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">No deals yet.</p>
          <Link
            href="/intake"
            className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#06210f] transition hover:opacity-90"
          >
            Start a search
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                <th className="px-4 py-2.5 font-medium">Search</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Budget</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => {
                const style = DEAL_STATUS_STYLE[deal.status] ?? { label: deal.status, color: "var(--text-secondary)" };
                return (
                  <tr key={deal.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={dealHref(deal)} className="hover:text-[var(--accent)]">
                        {deal.label}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {new Date(deal.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      ₹{deal.companyProfile.budgetInr.toLocaleString("en-IN")}/mo
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ color: style.color, background: `${style.color}22` }}
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
      )}
    </div>
  );
}
