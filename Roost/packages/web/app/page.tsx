import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "../lib/session";

const FEATURES = [
  {
    icon: "🔍",
    title: "AI-Powered Search",
    description:
      "Our agent scores every listing against your team size, budget, and must-haves to find your best fits.",
  },
  {
    icon: "🤝",
    title: "Autonomous Negotiation",
    description:
      "Once you pick a shortlist, the agent emails landlords and negotiates on your behalf — no back-and-forth required from you.",
  },
  {
    icon: "📧",
    title: "Email-Native",
    description:
      "Just email your requirements directly and the agent handles search, scoring, and outreach automatically.",
  },
];

const FOOTER_LINKS = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Privacy", href: "#" },
];

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/searches");

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--text-primary)" }}>
      <div className="mx-auto flex max-w-6xl flex-col px-6">
        <header className="flex items-center justify-between py-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="text-xl">🪺</span>
            <span>Roost</span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]/40"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            Sign in
          </Link>
        </header>

        <main className="flex flex-1 flex-col items-center pb-24 pt-20 text-center">
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Find your next office with Roost AI
          </h1>
          <p className="mt-5 max-w-xl text-base text-[var(--text-secondary)] sm:text-lg">
            Your AI agent for finding and negotiating the perfect office space, faster and smarter.
          </p>
          <Link
            href="/login"
            className="mt-8 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[#06210f] transition hover:opacity-90"
          >
            Get Started
          </Link>

          <div className="mt-24 grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border p-6 text-left"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <span className="text-2xl">{feature.icon}</span>
                <h3 className="mt-3 font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{feature.description}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="pb-10">
          <div className="h-px w-full" style={{ background: "var(--border)" }} />
          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <nav className="flex items-center gap-6">
              {FOOTER_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <p className="text-xs text-[var(--text-secondary)]">© 2026 Roost. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
