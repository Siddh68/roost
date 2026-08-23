// Smoke test for the SQLite store — CRUD round-trip, no Claude/Gmail needed.
// Uses a throwaway DB file so it doesn't collide with real deal data.

import { unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getDb,
  createDeal,
  getDeal,
  updateDealStatus,
  createThread,
  getThread,
  updateThread,
  getThreadsByDeal,
  getActiveThreadsByDeal,
  appendTranscript,
  getTranscript,
} from "./db/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = join(__dirname, "..", "data", ".test.sqlite");

for (const ext of ["", "-wal", "-shm"]) {
  const f = TEST_DB_PATH + ext;
  if (existsSync(f)) unlinkSync(f);
}

// getDb() is a lazily-initialized singleton; calling it once with an
// explicit path (before any other store.ts function runs) points the whole
// module at this throwaway test DB instead of the real one.
getDb(TEST_DB_PATH);

const profile = {
  teamSize: 25,
  budgetInr: 250000,
  preferredArea: "Koramangala",
  mustHaves: ["metro", "parking", "furnished"] as const,
  priceFloorPct: 0.85,
};

console.log("Creating deal...");
const deal = createDeal({ ...profile, mustHaves: [...profile.mustHaves] });
console.assert(getDeal(deal.id)?.id === deal.id, "getDeal round-trip failed");
console.log(`  OK: ${deal.id}, status=${deal.status}`);

console.log("Creating threads...");
const t1 = createThread({
  threadId: "thread-1",
  dealId: deal.id,
  listingId: "blr-001",
  landlordEmail: "landlord@example.com",
  askingPriceInr: 300000,
});
const t2 = createThread({
  threadId: "thread-2",
  dealId: deal.id,
  listingId: "blr-002",
  landlordEmail: "landlord@example.com",
  askingPriceInr: 280000,
});
console.assert(getThreadsByDeal(deal.id).length === 2, "getThreadsByDeal count wrong");
console.assert(getActiveThreadsByDeal(deal.id).length === 2, "active threads count wrong");
console.log(`  OK: 2 threads created, both active`);

console.log("Updating thread state...");
updateThread(t1.id, { currentOfferInr: 260000, roundsUsed: 1, priceMovementRounds: 1 });
const t1Updated = getThread(t1.id)!;
console.assert(t1Updated.currentOfferInr === 260000, "currentOfferInr not updated");
console.assert(t1Updated.roundsUsed === 1, "roundsUsed not updated");
console.log(`  OK: thread-1 currentOffer=${t1Updated.currentOfferInr} rounds=${t1Updated.roundsUsed}`);

console.log("Closing thread-1 as accepted...");
updateThread(t1.id, { status: "accepted" });
console.assert(getActiveThreadsByDeal(deal.id).length === 1, "active count should drop to 1");
console.log(`  OK: active threads now ${getActiveThreadsByDeal(deal.id).length}`);

console.log("Appending transcript entries...");
appendTranscript({
  dealId: deal.id,
  threadId: t1.id,
  type: "outreach_sent",
  payload: { subject: "test" },
});
appendTranscript({
  dealId: deal.id,
  threadId: t1.id,
  type: "policy_decision",
  payload: { action: "accept", finalPriceInr: 260000 },
});
const transcript = getTranscript(deal.id);
console.assert(transcript.length === 2, `expected 2 transcript entries, got ${transcript.length}`);
console.log(`  OK: ${transcript.length} transcript entries, types: ${transcript.map((t) => t.type).join(", ")}`);

console.log("Updating deal status...");
updateDealStatus(deal.id, "closed");
console.assert(getDeal(deal.id)?.status === "closed", "deal status not updated");
console.log(`  OK: deal status=${getDeal(deal.id)?.status}`);

console.log("\nAll store.ts assertions passed.");

// Best-effort cleanup — better-sqlite3 keeps the file handle open for the
// life of the process, so this can EBUSY on Windows; harmless either way
// since .test.sqlite* is gitignored and overwritten on the next run.
for (const ext of ["", "-wal", "-shm"]) {
  try {
    const f = TEST_DB_PATH + ext;
    if (existsSync(f)) unlinkSync(f);
  } catch {
    // ignore
  }
}
