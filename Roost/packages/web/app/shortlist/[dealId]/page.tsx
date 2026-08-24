import { notFound, redirect } from "next/navigation";
import { scoreListing } from "@roost/mcp-server/tools/scoreListing";
import { getDeal, getDealOwnerUserId } from "@roost/orchestrator/db/store";
import { getSessionUser } from "../../../lib/session";
import ShortlistClient from "./ShortlistClient";

export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [deal, ownerId] = await Promise.all([getDeal(dealId), getDealOwnerUserId(dealId)]);
  if (!deal || !ownerId) notFound();
  if (ownerId !== user.id && user.role !== "ADMIN") notFound();

  const scored = scoreListing(deal.companyProfile).slice(0, 10);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Shortlist</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Ranked for a {deal.companyProfile.teamSize}-person team, budget ₹
        {deal.companyProfile.budgetInr.toLocaleString("en-IN")}/month in {deal.companyProfile.preferredArea}.
        Pick which listings to reach out to — outreach emails go out immediately once you start.
      </p>

      <ShortlistClient
        dealId={dealId}
        scored={scored.map((s) => ({ listing: s.listing, score: s.result }))}
      />
    </div>
  );
}
