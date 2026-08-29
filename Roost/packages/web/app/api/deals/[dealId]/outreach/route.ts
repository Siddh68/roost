import { NextRequest, NextResponse } from "next/server";
import { requestOutreach } from "@roost/orchestrator/negotiation/stateMachine";
import { requireDealAccess } from "../../../../../lib/authz";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;
  const access = await requireDealAccess(dealId);
  if (!access.ok) return access.response;

  const { listingIds } = (await req.json()) as { listingIds: string[] };
  if (!Array.isArray(listingIds) || listingIds.length === 0) {
    return NextResponse.json({ error: "listingIds must be a non-empty array." }, { status: 400 });
  }

  // Queue only — no Gmail calls happen in this serverless function. Vercel
  // invocations are a separate, short-lived runtime from the always-on
  // agent process that actually owns Gmail traffic (its warmed-up client
  // and rate-limit backoff state live only in that process's memory), so
  // sending directly from here was an uncoordinated burst against the same
  // shared quota the agent was already managing — confirmed live as a real
  // contributor to the account's rate-limit trouble. The agent's own poll
  // loop drains this queue and sends the real outreach within its next
  // cycle (typically a few seconds).
  await requestOutreach(dealId, listingIds);

  return NextResponse.json({ ok: true });
}
