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
        <div className="mt-6 space-y-3">
          {deals.map((deal) => {
            const style = DEAL_STATUS_STYLE[deal.status] ?? { label: deal.status, color: "var(--text-secondary)" };
            return (
              <Link
                key={deal.id}
                href={dealHref(deal)}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{deal.label}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">Created</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {new Date(deal.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">Budget</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        ₹{deal.companyProfile.budgetInr.toLocaleString("en-IN")}/mo
                      </p>
                    </div>
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ color: style.color, background: `${style.color}22` }}
                >
                  {style.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
