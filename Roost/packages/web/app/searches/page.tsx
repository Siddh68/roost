import Link from "next/link";
import { redirect } from "next/navigation";
import { listCompanyProfilesByUser, listDealsByUser, type DealWithMeta } from "@roost/orchestrator/db/store";
import { getSessionUser } from "../../lib/session";
import RunSearchButton from "./RunSearchButton";

const DEAL_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  SHORTLISTED: { label: "Shortlisted", color: "var(--text-secondary)" },
  NEGOTIATING: { label: "Negotiating", color: "var(--info)" },
  WON: { label: "Won", color: "var(--accent)" },
  LOST: { label: "Lost", color: "var(--danger)" },
};

function dealHref(deal: DealWithMeta): string {
  return deal.status === "SHORTLISTED" ? `/shortlist/${deal.id}` : `/negotiation/${deal.id}`;
}

export default async function SearchesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [searches, deals] = await Promise.all([
    listCompanyProfilesByUser(user.id),
    listDealsByUser(user.id),
  ]);
  const dealsBySearch = new Map<string, DealWithMeta[]>();
  for (const deal of deals) {
    const list = dealsBySearch.get(deal.companyProfileId) ?? [];
    list.push(deal);
    dealsBySearch.set(deal.companyProfileId, list);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Saved searches</h1>
        <Link
          href="/intake"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#06210f] transition hover:opacity-90"
        >
          New search
        </Link>
      </div>

      {searches.length === 0 ? (
        <div className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No saved searches yet — create one to see a scored shortlist and start negotiating.
          </p>
          <Link
            href="/intake"
            className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#06210f] transition hover:opacity-90"
          >
            Create your first search
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {searches.map((search) => {
            const searchDeals = dealsBySearch.get(search.id) ?? [];
            return (
              <div key={search.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-medium">{search.label}</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {search.profile.teamSize} people · ₹{search.profile.budgetInr.toLocaleString("en-IN")}/mo · {search.profile.preferredArea}
                    </p>
                  </div>
                  <RunSearchButton searchId={search.id} />
                </div>

                {searchDeals.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
                    {searchDeals.map((deal) => {
                      const style = DEAL_STATUS_STYLE[deal.status] ?? { label: deal.status, color: "var(--text-secondary)" };
                      return (
                        <Link
                          key={deal.id}
                          href={dealHref(deal)}
                          className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-raised)]"
                        >
                          <span className="text-[var(--text-secondary)]">
                            {new Date(deal.createdAt).toLocaleDateString()}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium"
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
          })}
        </div>
      )}
    </div>
  );
}
