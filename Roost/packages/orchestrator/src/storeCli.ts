// Smoke test for the Prisma-backed store — CRUD round-trip across users,
// saved searches, deals, negotiation threads, and the transcript, with no
// Gmail or browser needed. Run after any schema/store.ts change to confirm
// the negotiation core still persists correctly.

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", "..", "..", ".env") });

import {
  getOrCreateCliUser,
  createCompanyProfile,
  getCompanyProfile,
  listCompanyProfilesByUser,
  createDeal,
  getDeal,
  updateDealStatus,
  listDealsByUser,
  createThread,
  getThread,
  updateThread,
  getThreadsByDeal,
  getActiveThreadsByDeal,
  appendTranscript,
  getTranscript,
  getActivityFeed,
  getAdminStats,
} from "./db/store.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  console.log("Creating CLI test user...");
  const user = await getOrCreateCliUser();
  console.log(`  OK: ${user.email}`);

  console.log("Creating a saved search...");
  const search = await createCompanyProfile({
    userId: user.id,
    label: "storeCli smoke test search",
    profile: {
      teamSize: 25,
      budgetInr: 250000,
      preferredArea: "Koramangala",
      mustHaves: ["metro", "parking", "furnished"],
      priceFloorPct: 0.85,
    },
  });
  assert((await getCompanyProfile(search.id))?.id === search.id, "getCompanyProfile round-trip failed");
  assert(
    (await listCompanyProfilesByUser(user.id)).some((s) => s.id === search.id),
    "listCompanyProfilesByUser missing the new search"
  );
  console.log(`  OK: ${search.id}, budget=${search.profile.budgetInr}, mustHaves=${search.profile.mustHaves.join(",")}`);

  console.log("Creating a deal...");
  const deal = await createDeal(search.id);
  assert((await getDeal(deal.id))?.status === "SHORTLISTED", "new deal should start SHORTLISTED");
  assert((await getDeal(deal.id))?.companyProfile.budgetInr === 250000, "deal.companyProfile should carry the profile shape");
  console.log(`  OK: ${deal.id}, status=${deal.status}`);

  console.log("Updating deal status...");
  await updateDealStatus(deal.id, "NEGOTIATING");
  assert((await getDeal(deal.id))?.status === "NEGOTIATING", "status update didn't persist");
  console.log(`  OK: status=${(await getDeal(deal.id))?.status}`);

  console.log("Creating two negotiation threads...");
  const t1 = await createThread({
    threadId: "smoke-thread-1",
    dealId: deal.id,
    listingId: "blr-001",
    landlordEmail: "landlord@example.com",
    askingPriceInr: 300000,
  });
  const t2 = await createThread({
    threadId: "smoke-thread-2",
    dealId: deal.id,
    listingId: "blr-002",
    landlordEmail: "landlord@example.com",
    askingPriceInr: 280000,
  });
  assert((await getThreadsByDeal(deal.id)).length === 2, "expected 2 threads");
  assert((await getActiveThreadsByDeal(deal.id)).length === 2, "expected 2 active threads");
  console.log(`  OK: ${t1.id}, ${t2.id}, both active`);

  console.log("Updating thread state...");
  await updateThread(t1.id, { currentOfferInr: 260000, roundsUsed: 1, priceMovementRounds: 1 });
  const t1Updated = await getThread(t1.id);
  assert(t1Updated?.currentOfferInr === 260000, "currentOfferInr not updated");
  assert(t1Updated?.roundsUsed === 1, "roundsUsed not updated");
  console.log(`  OK: currentOffer=${t1Updated?.currentOfferInr} rounds=${t1Updated?.roundsUsed}`);

  console.log("Closing thread-1 as accepted...");
  await updateThread(t1.id, { status: "accepted" });
  assert((await getActiveThreadsByDeal(deal.id)).length === 1, "active count should drop to 1");
  console.log(`  OK: active threads now ${(await getActiveThreadsByDeal(deal.id)).length}`);

  console.log("Appending transcript entries...");
  await appendTranscript({ dealId: deal.id, threadId: t1.id, type: "outreach_sent", payload: { subject: "test" } });
  await appendTranscript({
    dealId: deal.id,
    threadId: t1.id,
    type: "policy_decision",
    payload: { action: "accept", finalPriceInr: 260000 },
  });
  const transcript = await getTranscript(deal.id);
  assert(transcript.length === 2, `expected 2 transcript entries, got ${transcript.length}`);
  console.log(`  OK: ${transcript.length} entries, types: ${transcript.map((t) => t.type).join(", ")}`);

  console.log("Checking the activity feed picks these events up...");
  const feed = await getActivityFeed({ userId: user.id, limit: 10 });
  assert(feed.some((e) => e.dealId === deal.id), "activity feed missing this deal's events");
  console.log(`  OK: ${feed.length} event(s) in feed`);

  console.log("Checking listDealsByUser + admin stats...");
  const userDeals = await listDealsByUser(user.id);
  assert(userDeals.some((d) => d.id === deal.id), "listDealsByUser missing the new deal");
  const stats = await getAdminStats();
  assert(stats.totalUsers >= 1, "admin stats should count at least this user");
  console.log(`  OK: ${userDeals.length} deal(s) for user, ${stats.totalUsers} total user(s)`);

  console.log("\nAll store.ts (Prisma) assertions passed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
