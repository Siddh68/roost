// CLI entrypoint for the negotiation orchestrator.
//
//   npm run demo --workspace=packages/orchestrator [-- ./profile.json]
//     Runs the whole loop in one process: intake -> shortlist -> outreach ->
//     (landlord auto-reply + agent poll) on a fast interval until every
//     thread resolves or a round cap is hit. This is the Day-2 milestone:
//     the full headless negotiation, provable without any UI.
//
//   npm run outreach --workspace=packages/orchestrator [-- ./profile.json]
//     Creates a deal and sends outreach only; prints the dealId.
//
//   npm run poll --workspace=packages/orchestrator -- <dealId>
//     Runs the agent's poll loop for an existing deal at demo-mode cadence
//     (real Gmail pace — pair with a separately-running landlord-responder).
//
//   npm run landlord-responder --workspace=packages/orchestrator
//     Runs the TEST-ONLY landlord auto-responder loop (Section 5.4).
//
// Runs entirely without NextAuth/a browser session — uses a fixed local
// "CLI test user" (see db/store.ts's getOrCreateCliUser) so the headless
// loop stays provable independent of the web app, per BUILD_SPEC.md.

import { config } from "dotenv";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { CompanyProfile } from "@roost/mcp-server/types";
import { scoreListing } from "@roost/mcp-server/tools/scoreListing";
import {
  getOrCreateCliUser,
  createCompanyProfile,
  createDeal,
  getDeal,
  getThreadsByDeal,
  getTranscript,
} from "./db/store.js";
import { startOutreach, pollDealOnce, runPollLoop } from "./negotiation/stateMachine.js";
import {
  runLandlordAutoResponderOnce,
  runLandlordAutoResponderLoop,
} from "./negotiation/landlordAutoResponder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// npm workspaces run this with cwd = packages/orchestrator, so the bare
// "dotenv/config" import would look for .env there instead of the repo root.
config({ path: join(__dirname, "..", "..", "..", ".env") });

const DEFAULT_PROFILE: CompanyProfile = {
  teamSize: 25,
  budgetInr: 250000,
  preferredArea: "Koramangala",
  mustHaves: ["metro", "parking", "furnished"],
  priceFloorPct: 0.85,
};

function loadProfile(path?: string): CompanyProfile {
  if (!path) return DEFAULT_PROFILE;
  return JSON.parse(readFileSync(path, "utf-8")) as CompanyProfile;
}

function resetMockState(): void {
  for (const file of [
    join(__dirname, "..", "..", "mcp-server", "src", "data", ".mockMailbox.json"),
    join(__dirname, "..", "data", ".landlordAutoResponderState.json"),
  ]) {
    if (existsSync(file)) unlinkSync(file);
  }
}

async function printTranscript(dealId: string): Promise<void> {
  console.log("\n=== Transcript ===");
  for (const entry of await getTranscript(dealId)) {
    console.log(
      `[${new Date(entry.timestamp).toLocaleTimeString()}] ${entry.threadId.slice(0, 12)} ${entry.type}:`,
      entry.payload
    );
  }
  console.log("\n=== Final thread states ===");
  for (const t of await getThreadsByDeal(dealId)) {
    console.log(
      `  ${t.listingId}: status=${t.status} asking=₹${t.askingPriceInr.toLocaleString("en-IN")} ` +
        `current=₹${t.currentOfferInr.toLocaleString("en-IN")} rounds=${t.roundsUsed}`
    );
  }
}

async function createCliDeal(profile: CompanyProfile, label: string) {
  const user = await getOrCreateCliUser();
  const search = await createCompanyProfile({ userId: user.id, label, profile });
  return createDeal(search.id);
}

async function cmdDemo(profilePath?: string, fresh = false, shortlistSize = 3): Promise<void> {
  if (fresh) {
    resetMockState();
    console.log("Cleared mock mailbox + landlord-responder state.\n");
  }

  const profile = loadProfile(profilePath);
  const deal = await createCliDeal(profile, `CLI demo — ${new Date().toLocaleString()}`);
  console.log(`Created deal ${deal.id}`);
  console.log(profile);

  const scored = scoreListing(profile).slice(0, shortlistSize);
  console.log(`\nShortlisted ${scored.length} listing(s):`);
  for (const s of scored) {
    console.log(`  [${s.result.totalScore}] ${s.listing.title} — ${s.listing.area} (₹${s.listing.monthlyRentInr.toLocaleString("en-IN")}/mo)`);
  }

  await startOutreach(
    deal.id,
    scored.map((s) => s.listing.id)
  );
  console.log("\nOutreach sent. Starting negotiation loop...\n");

  const intervalMs = Number(process.env.DEMO_POLL_INTERVAL_MS ?? 2000);
  const maxIterations = Number(process.env.DEMO_MAX_ITERATIONS ?? 20);

  for (let i = 0; i < maxIterations; i++) {
    const dealNow = await getDeal(deal.id);
    if (dealNow && (dealNow.status === "WON" || dealNow.status === "LOST")) {
      console.log(`Deal resolved (${dealNow.status}) after ${i} round(s).`);
      break;
    }

    const { threadsHandled } = await runLandlordAutoResponderOnce();
    const { threadsWithActivity } = await pollDealOnce(deal.id);
    console.log(
      `[round ${i + 1}] landlord replied to ${threadsHandled} thread(s), agent acted on ${threadsWithActivity} thread(s).`
    );

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  await printTranscript(deal.id);
}

async function cmdOutreach(profilePath?: string, shortlistSize = 3): Promise<void> {
  const profile = loadProfile(profilePath);
  const deal = await createCliDeal(profile, `CLI outreach — ${new Date().toLocaleString()}`);
  const scored = scoreListing(profile).slice(0, shortlistSize);
  await startOutreach(
    deal.id,
    scored.map((s) => s.listing.id)
  );
  console.log(`Deal ${deal.id} — outreach sent to ${scored.length} listing(s).`);
  for (const s of scored) console.log(`  ${s.listing.id}: ${s.listing.title}`);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;

  switch (cmd) {
    case "demo": {
      const fresh = rest.includes("--fresh");
      const profilePath = rest.find((a) => !a.startsWith("--"));
      await cmdDemo(profilePath, fresh);
      break;
    }
    case "outreach": {
      await cmdOutreach(rest[0]);
      break;
    }
    case "poll": {
      const dealId = rest[0];
      if (!dealId) throw new Error("Usage: poll <dealId>");
      const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 35000);
      console.log(`Polling deal ${dealId} every ${intervalMs}ms (Ctrl+C to stop)...`);
      await runPollLoop(dealId, intervalMs);
      break;
    }
    case "landlord-responder": {
      const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 35000);
      console.log(`Landlord auto-responder polling every ${intervalMs}ms (Ctrl+C to stop)...`);
      await runLandlordAutoResponderLoop(intervalMs);
      break;
    }
    default:
      console.log(
        "Usage: tsx src/index.ts <demo|outreach|poll|landlord-responder> [args]\n" +
          "  demo [profile.json] [--fresh]\n" +
          "  outreach [profile.json]\n" +
          "  poll <dealId>\n" +
          "  landlord-responder"
      );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
