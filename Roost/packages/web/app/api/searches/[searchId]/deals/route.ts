import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "../../../../../lib/session";
import { getCompanyProfile, createDeal } from "@roost/orchestrator/db/store";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ searchId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchId } = await params;
  const search = await getCompanyProfile(searchId);
  if (!search) {
    return NextResponse.json({ error: "Saved search not found." }, { status: 404 });
  }
  if (search.userId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Not your saved search." }, { status: 403 });
  }

  const deal = await createDeal(search.id);
  return NextResponse.json({ dealId: deal.id });
}
