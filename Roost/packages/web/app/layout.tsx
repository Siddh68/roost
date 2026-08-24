import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roost",
  description: "AI agent that finds and negotiates office space.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/intake" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="text-lg">🪺</span>
              <span>Roost</span>
            </Link>
            <nav className="text-sm text-[var(--text-secondary)]">
              <Link href="/intake" className="hover:text-[var(--text-primary)]">
                New search
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
