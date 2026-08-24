import { NextRequest, NextResponse } from "next/server";
import { startOutreach } from "@roost/orchestrator/negotiation/stateMachine";
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

  await startOutreach(dealId, listingIds);

  return NextResponse.json({ ok: true });
}
