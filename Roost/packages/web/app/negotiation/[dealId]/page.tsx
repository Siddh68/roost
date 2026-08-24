import { notFound, redirect } from "next/navigation";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import { getDeal, getDealOwnerUserId, getThreadsByDeal, getTranscript } from "@roost/orchestrator/db/store";
import { getSessionUser } from "../../../lib/session";
import NegotiationClient from "./NegotiationClient";

export default async function NegotiationPage({
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

  const threads = await getThreadsByDeal(dealId);
  const transcript = await getTranscript(dealId);
  const listingIds = new Set(threads.map((t) => t.listingId));
  const listings = loadListings().filter((l) => listingIds.has(l.id));

  return (
    <NegotiationClient
      dealId={dealId}
      initialDeal={deal}
      initialThreads={threads}
      initialTranscript={transcript}
      initialListings={listings}
    />
  );
}
