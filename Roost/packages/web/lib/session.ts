import { createClient } from "./supabase/server";
import { getOrCreateProfile } from "@roost/orchestrator/db/store";

export interface SessionUser {
  id: string;
  email: string;
  role: "COMPANY" | "ADMIN";
}

/**
 * The single place every page/route/middleware asks "who's logged in, and
 * are they an admin." Wraps Supabase's own session with a lazily-created
 * Prisma Profile row (role assigned from ADMIN_EMAILS) — this is what
 * replaces NextAuth's signIn callback: whichever way the user authenticated
 * (Google or email/password), the first real request after sign-in creates
 * their profile.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const profile = await getOrCreateProfile({ id: user.id, email: user.email, name: user.user_metadata?.full_name ?? null });
  return { id: profile.id, email: profile.email, role: profile.role };
}
