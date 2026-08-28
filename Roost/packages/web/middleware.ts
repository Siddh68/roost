import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request (per @supabase/ssr's
// documented pattern) and redirects unauthenticated users to /login.
//
// Admin-only route protection (/admin/*) deliberately does NOT live here:
// middleware runs on the Edge runtime by default, where Prisma (needed to
// look up a user's role) doesn't work reliably. Every admin page already
// independently checks `role !== "ADMIN"` server-side via getSessionUser()
// (which runs in the Node.js runtime, not Edge) — that's the real
// enforcement; this middleware only handles the "are you signed in at all"
// gate, which only needs the Supabase session itself.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Protect everything except the login page, the OAuth callback route, the
// public marketing landing page at the exact root path (app/page.tsx itself
// still redirects a signed-in visitor on to /searches — this only stops
// middleware from bouncing a signed-OUT visitor away before that page ever
// renders), the public about page, Next's static/internal assets, and any
// request for a static file (images, video, fonts) served from /public —
// missing this exemption is why the logo image, and separately the landing
// page's promo video, silently failed to load for a logged-out visitor: the
// request got redirected to /login instead of ever reaching the file.
export const config = {
  matcher: [
    "/((?!login|auth/callback|about|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|mp4|webm|mov|mp3)$|$).*)",
  ],
};
