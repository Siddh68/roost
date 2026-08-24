import { notFound } from "next/navigation";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import { getDeal, getThreadsByDeal, getTranscript } from "@roost/orchestrator/db/store";
import NegotiationClient from "./NegotiationClient";

export default async function NegotiationPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const deal = getDeal(dealId);
  if (!deal) notFound();

  const threads = getThreadsByDeal(dealId);
  const transcript = getTranscript(dealId);
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
