import { NextResponse } from "next/server";
import { getSessionUser } from "./session";
import { getDealOwnerUserId } from "@roost/orchestrator/db/store";

/**
 * Resolves the current session and checks it against a deal's owner. Admins
 * can access any deal; company users only their own. Returns either the
 * session (access granted) or a NextResponse to return immediately.
 */
export async function requireDealAccess(
  dealId: string
): Promise<{ ok: true; userId: string; role: "COMPANY" | "ADMIN" } | { ok: false; response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }

  const ownerId = await getDealOwnerUserId(dealId);
  if (ownerId == null) {
    return { ok: false, response: NextResponse.json({ error: "Deal not found." }, { status: 404 }) };
  }
  if (ownerId !== user.id && user.role !== "ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "Not your deal." }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, role: user.role };
}
