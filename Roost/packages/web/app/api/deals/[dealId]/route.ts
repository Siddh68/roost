import { NextRequest, NextResponse } from "next/server";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import { getDeal, getThreadsByDeal, getTranscript } from "@roost/orchestrator/db/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;
  const deal = getDeal(dealId);
  if (!deal) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }

  const threads = getThreadsByDeal(dealId);
  const transcript = getTranscript(dealId);

  const listingIds = new Set(threads.map((t) => t.listingId));
  const listings = loadListings().filter((l) => listingIds.has(l.id));

  return NextResponse.json({ deal, threads, transcript, listings });
}
