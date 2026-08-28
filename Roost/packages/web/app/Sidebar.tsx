"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import type { SessionUser } from "../lib/session";

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19V10M11 19V5M18 19v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 5 6v5.5c0 4.4 2.9 7.9 7 8.9 4.1-1 7-4.5 7-8.9V6l-7-2.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12h10m0 0-3.5-3.5M20 12l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/searches", label: "Searches", icon: SearchIcon },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
];

function NavItem({
  href,
  label,
  Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: () => React.ReactElement;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
      style={{
        color: active ? "var(--accent)" : "var(--text-secondary)",
        background: active ? "var(--accent-dim)" : "transparent",
        fontWeight: active ? 600 : 400,
      }}
    >
      <Icon />
      {label}
    </Link>
  );
}

export default function Sidebar({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Belt-and-suspenders: also close on any route change (back/forward,
  // programmatic navigation) beyond the explicit onClick handlers below.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!user) return null;

  return (
    <>
      {/* Mobile top bar — the only way to reopen the drawer once it's closed */}
      <div
        className="sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 lg:hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <Link href="/searches" className="flex items-center gap-2 font-semibold tracking-tight">
          <img src="/roost-logo.png" alt="" className="h-6 w-6" />
          <span>Roost</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          className="rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-raised)]"
          style={{ color: "var(--text-secondary)" }}
        >
          <MenuIcon />
        </button>
      </div>

      {/* Backdrop, mobile only, while the drawer is open. Sits above the
          floating email-agent button (z-50) so that button can't visually
          or interactively poke through a supposedly-modal drawer. */}
      {open && (
        <div
          className="fixed inset-0 z-[55] bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer on mobile (off-canvas, slides in), persistent sidebar on
          desktop. z-[60] (above the email-agent button's z-50) so that
          button can never sit on top of — and steal taps from — the
          drawer's bottom controls on narrow screens where they'd overlap.
          overflow-y-auto so a short viewport scrolls instead of clipping
          the sign-out button below the fold. */}
      <nav
        className={`fixed left-0 top-0 z-[60] flex h-screen w-64 max-w-[80vw] flex-col overflow-y-auto border-r px-3 py-5 transition-transform duration-200 ease-out lg:w-60 lg:translate-x-0 ${
          // Scoped to max-lg: so this toggle's rule only ever exists under a
          // max-width media query and can never tie in specificity with (or
          // lose the cascade order race against) the unconditional
          // lg:translate-x-0 above - an earlier plain translate-x-0 /
          // -translate-x-full pair here silently never opened on mobile at
          // all, since Tailwind happened to emit -translate-x-full's rule
          // after lg:translate-x-0's in the stylesheet, so it kept winning
          // even when the lg: media query matched.
          open ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"
        }`}
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <Link href="/searches" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/roost-logo.png" alt="" className="h-7 w-7" />
            <span>Roost</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-lg p-1 transition-colors hover:bg-[var(--surface-raised)] lg:hidden"
            style={{ color: "var(--text-secondary)" }}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} onNavigate={() => setOpen(false)} />
          ))}
          {user.role === "ADMIN" && (
            <NavItem href="/admin" label="Admin" Icon={AdminIcon} onNavigate={() => setOpen(false)} />
          )}
        </div>

        <div className="space-y-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <Link
            href="/about"
            onClick={() => setOpen(false)}
            className="block px-2 text-xs transition-colors hover:text-[var(--text-primary)]"
            style={{ color: "var(--text-secondary)" }}
          >
            About Roost
          </Link>
          <p className="truncate px-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            {user.email}
          </p>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-lg border py-3 text-sm font-medium transition-colors hover:bg-[var(--surface-raised)] active:bg-[var(--surface-raised)]"
            style={{ color: "var(--text-primary)", borderColor: "var(--border)", minHeight: "44px" }}
          >
            <SignOutIcon />
            Sign out
          </button>
        </div>
      </nav>
    </>
  );
}
