"use client";

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

const NAV_ITEMS = [
  { href: "/searches", label: "Searches", icon: SearchIcon },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
];

function NavItem({ href, label, Icon }: { href: string; label: string; Icon: () => React.ReactElement }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!user) return null;

  return (
    <nav
      className="fixed left-0 top-0 flex h-screen w-60 flex-col border-r px-3 py-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <Link href="/searches" className="mb-6 flex items-center gap-2 px-2 font-semibold tracking-tight">
        <span className="text-xl">🪺</span>
        <span>Roost</span>
      </Link>

      <div className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} />
        ))}
        {user.role === "ADMIN" && <NavItem href="/admin" label="Admin" Icon={AdminIcon} />}
      </div>

      <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <Link
          href="/about"
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
          className="w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-raised)]"
          style={{ color: "var(--text-secondary)" }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
