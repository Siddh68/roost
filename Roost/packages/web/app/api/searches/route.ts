import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "../../../lib/session";
import type { CompanyProfile } from "@roost/mcp-server/types";
import { scoreListing } from "@roost/mcp-server/tools/scoreListing";
import { createCompanyProfile, createDeal } from "@roost/orchestrator/db/store";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await req.json()) as { label?: string } & CompanyProfile;

  if (
    typeof body.teamSize !== "number" ||
    typeof body.budgetInr !== "number" ||
    typeof body.preferredArea !== "string" ||
    !Array.isArray(body.mustHaves) ||
    typeof body.priceFloorPct !== "number"
  ) {
    return NextResponse.json({ error: "Invalid company profile." }, { status: 400 });
  }

  const profile: CompanyProfile = {
    teamSize: body.teamSize,
    budgetInr: body.budgetInr,
    preferredArea: body.preferredArea,
    mustHaves: body.mustHaves,
    priceFloorPct: body.priceFloorPct,
  };
  const label = body.label?.trim() || `${profile.preferredArea} search`;

  const search = await createCompanyProfile({ userId: user.id, label, profile });
  const deal = await createDeal(search.id);
  const scored = scoreListing(profile);

  return NextResponse.json({
    searchId: search.id,
    dealId: deal.id,
    shortlist: scored.slice(0, 10).map((s) => ({ listing: s.listing, score: s.result })),
  });
}
