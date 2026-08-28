import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "../lib/session";
import PromoVideo from "./PromoVideo";

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
            <img src="/roost-logo.png" alt="" className="h-7 w-7" />
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

        <main className="flex flex-1 flex-col pb-24 pt-16 sm:pt-20">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="text-center lg:text-left">
              <h1 className="mx-auto max-w-xl text-4xl font-bold tracking-tight sm:text-5xl lg:mx-0">
                Find your next office with Roost AI
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base text-[var(--text-secondary)] sm:text-lg lg:mx-0">
                Your AI agent for finding and negotiating the perfect office space, faster and smarter.
              </p>
              <Link
                href="/login"
                className="mt-8 inline-block rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[#06210f] transition hover:opacity-90"
              >
                Get Started
              </Link>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="relative flex h-56 w-56 items-center justify-center sm:h-72 sm:w-72">
                <div
                  className="absolute inset-0 rounded-full blur-2xl"
                  style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent), transparent 70%)" }}
                  aria-hidden="true"
                />
                <img
                  src="/roost-logo.png"
                  alt="Roost"
                  className="relative h-full w-full object-contain"
                  style={{ filter: "drop-shadow(0 0 32px color-mix(in srgb, var(--accent) 45%, transparent))" }}
                />
              </div>
            </div>
          </div>

          <div className="mt-20 grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
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

          <div className="mt-24">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">See Roost in action</h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-sm text-[var(--text-secondary)] sm:text-base">
              Search, scoring, live negotiation, and a reply sent in under 15 seconds — start to finish.
            </p>
            <div className="mx-auto mt-8 max-w-3xl">
              <PromoVideo />
            </div>
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
