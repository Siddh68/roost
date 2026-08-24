// Drives one round of the negotiation loop on demand: the test-only landlord
// auto-responder checks for new mail and replies, then the agent polls and
// reacts. Called on an interval by the negotiation page's client component
// so the whole demo runs from one browser tab, no separate terminals needed.

import { NextRequest, NextResponse } from "next/server";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import { getDeal, getThreadsByDeal, getTranscript } from "@roost/orchestrator/db/store";
import { pollDealOnce } from "@roost/orchestrator/negotiation/stateMachine";
import { runLandlordAutoResponderOnce } from "@roost/orchestrator/negotiation/landlordAutoResponder";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;
  const deal = getDeal(dealId);
  if (!deal) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }

  if (deal.status === "negotiating") {
    await runLandlordAutoResponderOnce();
    await pollDealOnce(dealId);
  }

  const updatedDeal = getDeal(dealId)!;
  const threads = getThreadsByDeal(dealId);
  const transcript = getTranscript(dealId);
  const listingIds = new Set(threads.map((t) => t.listingId));
  const listings = loadListings().filter((l) => listingIds.has(l.id));

  return NextResponse.json({ deal: updatedDeal, threads, transcript, listings });
}
