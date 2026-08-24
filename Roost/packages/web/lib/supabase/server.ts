import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for Server Components, Route Handlers, and
 * Server Actions — reads/writes the session via Next's cookie store, per
 * @supabase/ssr's documented App Router pattern. Server Components can't
 * write cookies, so the setAll() call there is wrapped in a try/catch — the
 * middleware (see middleware.ts) is what actually refreshes the session
 * cookie on every request, this is just for reading it.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — middleware refreshes
            // the session instead, so this is safe to ignore here.
          }
        },
      },
    }
  );
}
