import Link from "next/link";
import { redirect } from "next/navigation";
import { getActivityFeed } from "@roost/orchestrator/db/store";
import { getSessionUser } from "../../lib/session";
import { TranscriptRow } from "../../components/TranscriptRow";

export default async function ActivityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const feed = await getActivityFeed({ userId: user.id, limit: 50 });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Recent events across all your deals, most recent first.
      </p>

      {feed.length === 0 ? (
        <div className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            Nothing yet — activity shows up here once a negotiation starts.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {feed.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]/40"
            >
              <Link
                href={`/negotiation/${entry.dealId}`}
                className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-secondary)] hover:text-[var(--accent)]"
              >
                {entry.dealLabel}
                <span className="text-[var(--border)]">·</span>
                {entry.listingId}
              </Link>
              <TranscriptRow entry={entry} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
