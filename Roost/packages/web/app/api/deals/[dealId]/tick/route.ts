// Refreshes the negotiation view from the database. Actually driving the
// negotiation forward (polling Gmail, classifying replies, deciding moves)
// is owned exclusively by the always-on poll-all loop in agent.js — that
// loop persists ML model weights and dedup state to local files on its own
// host, so a second, independent driver here would both race it (two
// actors reacting to the same landlord reply) and crash outright on a
// read-only/serverless filesystem like Vercel's. This route used to call
// pollDealOnce/runLandlordAutoResponderOnce directly for a single-browser-tab
// demo mode from before the always-on agent existed; now it just re-reads
// current state so the page reflects what the background agent has done.

import { NextRequest, NextResponse } from "next/server";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import { getDeal, getThreadsByDeal, getTranscript } from "@roost/orchestrator/db/store";
import { requireDealAccess } from "../../../../../lib/authz";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;
  const access = await requireDealAccess(dealId);
  if (!access.ok) return access.response;

  const deal = await getDeal(dealId);
  if (!deal) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }

  const updatedDeal = deal;
  const threads = await getThreadsByDeal(dealId);
  const transcript = await getTranscript(dealId);
  const listingIds = new Set(threads.map((t) => t.listingId));
  const listings = loadListings().filter((l) => listingIds.has(l.id));

  return NextResponse.json({ deal: updatedDeal, threads, transcript, listings });
}
