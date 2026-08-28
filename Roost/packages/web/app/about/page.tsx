import Link from "next/link";
import { getSessionUser } from "../../lib/session";

const CAPABILITIES = [
  {
    icon: "🔍",
    title: "AI-powered search & scoring",
    description:
      "Tell the agent your team size, budget, and must-haves. It searches available listings and scores every one on cost fit, commute, and amenities, with plain-language reasoning for each score.",
  },
  {
    icon: "🤝",
    title: "Fully autonomous negotiation",
    description:
      "Pick a shortlist and the agent emails every landlord and negotiates on your behalf end-to-end — no drafting replies, no approving each message. It reads replies, decides the next move, and sends the response itself.",
  },
  {
    icon: "🛡️",
    title: "Guardrails that never bend",
    description:
      "The agent never offers above your budget and never above what a listing is actually asking. Deterministic rules — not the AI — enforce your price ceiling and floor on every single move.",
  },
  {
    icon: "📈",
    title: "A negotiator that learns",
    description:
      "A classifier reads landlord tone (accepting, countering, asking a question, declining) and a concession model learns how much to give up each round — both improve the more the agent negotiates.",
  },
  {
    icon: "📧",
    title: "Email-native, zero learning curve",
    description:
      "No new app to learn: email your requirements directly to the agent's address, or use the site. Landlords just get normal emails back — they never know they're negotiating with an AI.",
  },
  {
    icon: "📊",
    title: "Full transparency",
    description:
      "Every message, tone read, and pricing decision is logged to a live activity feed and per-listing transcript, so you can see exactly why the agent made each move.",
  },
];

const AUDIENCE = [
  {
    title: "Startups & small teams",
    description: "Finding your first or next office without a broker, and without days of email back-and-forth.",
  },
  {
    title: "Growing companies",
    description: "Comparing several listings at once and negotiating all of them in parallel, not one at a time.",
  },
  {
    title: "Anyone who dislikes negotiating",
    description: "Set your budget and must-haves once — the agent handles every awkward price conversation for you.",
  },
];

const STEPS = [
  { step: "1", title: "Tell it what you need", description: "Team size, budget, area, and must-haves — via the intake form or a plain email." },
  { step: "2", title: "Review a scored shortlist", description: "The agent searches and ranks listings, explaining why each one fits." },
  { step: "3", title: "Start negotiation", description: "Select the listings you like — the agent emails every landlord and takes it from there." },
  { step: "4", title: "Watch it close", description: "Track every offer and reply live, right up to a deal within your budget." },
];

export default async function AboutPage() {
  const user = await getSessionUser();

  const content = (
    <>
      <section className="pb-16 pt-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">About Roost</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
          Roost is an AI agent that searches for office space and negotiates the lease on your behalf —
          entirely by email, entirely on its own, from first offer to closed deal.
        </p>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          What it does
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <span className="text-xl">{c.icon}</span>
              <h3 className="mt-2 font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{c.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          How it works
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
              >
                {s.step}
              </span>
              <h3 className="mt-3 text-sm font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Who it's for
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {AUDIENCE.map((a) => (
            <div
              key={a.title}
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <h3 className="font-semibold tracking-tight">{a.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{a.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="mt-16 rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--accent-dim)", borderLeft: "3px solid var(--accent)" }}
      >
        <h2 className="font-semibold tracking-tight" style={{ color: "var(--accent)" }}>
          Why it's useful
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Office negotiations are slow and repetitive — the same back-and-forth over price, repeated with every
          landlord. Roost removes that entirely: it never gets tired, never misses a reply, and never negotiates
          outside the budget you set. You get the outcome of a patient, disciplined negotiator without spending
          a single hour on email.
        </p>
      </section>

      {!user && (
        <section className="mt-16 flex flex-col items-center pb-8 text-center">
          <Link
            href="/login"
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[#06210f] transition hover:opacity-90"
          >
            Get Started
          </Link>
        </section>
      )}
    </>
  );

  if (user) {
    return content;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--text-primary)" }}>
      <div className="mx-auto flex max-w-5xl flex-col px-6">
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
        <main className="pb-16">{content}</main>
      </div>
    </div>
  );
}
