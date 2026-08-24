"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import type { SessionUser } from "../lib/session";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={active ? "text-[var(--text-primary)]" : "hover:text-[var(--text-primary)]"}
    >
      {children}
    </Link>
  );
}

export default function HeaderNav({ user }: { user: SessionUser | null }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/searches" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="text-lg">🪺</span>
          <span>Roost</span>
        </Link>

        {user ? (
          <nav className="flex items-center gap-5 text-sm text-[var(--text-secondary)]">
            <NavLink href="/searches">Searches</NavLink>
            <NavLink href="/history">History</NavLink>
            <NavLink href="/activity">Activity</NavLink>
            {user.role === "ADMIN" && <NavLink href="/admin">Admin</NavLink>}
            <span className="mx-1 h-4 w-px bg-[var(--border)]" />
            <span className="hidden text-xs text-[var(--text-secondary)] sm:inline">{user.email}</span>
            <button onClick={handleSignOut} className="hover:text-[var(--text-primary)]">
              Sign out
            </button>
          </nav>
        ) : (
          <Link
            href="/login"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--accent)]/40"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
