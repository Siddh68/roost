import { NextRequest, NextResponse } from "next/server";
import type { CompanyProfile } from "@roost/mcp-server/types";
import { scoreListing } from "@roost/mcp-server/tools/scoreListing";
import { createDeal } from "@roost/orchestrator/db/store";

export async function POST(req: NextRequest) {
  const profile = (await req.json()) as CompanyProfile;

  if (
    typeof profile.teamSize !== "number" ||
    typeof profile.budgetInr !== "number" ||
    typeof profile.preferredArea !== "string" ||
    !Array.isArray(profile.mustHaves) ||
    typeof profile.priceFloorPct !== "number"
  ) {
    return NextResponse.json({ error: "Invalid company profile." }, { status: 400 });
  }

  const deal = createDeal(profile);
  const scored = scoreListing(profile);

  return NextResponse.json({
    dealId: deal.id,
    shortlist: scored.slice(0, 10).map((s) => ({ listing: s.listing, score: s.result })),
  });
}
