// TEST ONLY — see BUILD_SPEC.md Section 5.4. This is scaffolding so the demo
// has something to negotiate against; it is not a product feature and must
// never be described as a "second AI agent" anywhere user-facing.
//
// No LLM, no API key: a small rule-based concession ladder (floor = 90% of
// asking price, conceding a bit further each round) decides accept/counter,
// and a fixed template renders the reply. It has no registry of threads to
// track (that's the agent's DB), so it always polls in inbox-discovery mode
// and identifies which listing a thread is about via the `[ref:<listingId>]`
// tag the agent embeds in its outreach subject line.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Listing } from "@roost/mcp-server/types";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import { sendEmail, checkInbox, readThread, accountEmail } from "@roost/mcp-server/tools/emailAgent";
import { extractPriceInr } from "./ruleBasedNlu.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, "..", "..", "data", ".landlordAutoResponderState.json");

interface LandlordState {
  lastPolledAt: number;
  seenThreadIds: string[];
}

function loadState(): LandlordState {
  if (!existsSync(STATE_PATH)) return { lastPolledAt: 0, seenThreadIds: [] };
  return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as LandlordState;
}

function saveState(state: LandlordState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

function extractListingRef(subject: string): string | null {
  const match = subject.match(/\[ref:([\w-]+)\]/);
  return match ? match[1] : null;
}

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader.trim();
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

const listingById = new Map(loadListings().map((l) => [l.id, l]));

// --- rule-based landlord concession ladder ----------------------------------

type LandlordDecision =
  | { action: "accept"; priceInr: number }
  | { action: "counter"; priceInr: number };

const CONCESSION_FRACTIONS = [0.95, 0.92, 0.9]; // fraction of asking price, tightening each round

function landlordDecide(
  listing: Listing,
  agentOfferedPriceInr: number | null,
  landlordReplyRoundIndex: number
): LandlordDecision {
  const asking = listing.monthlyRentInr;
  const floor = Math.round(asking * 0.9);

  if (agentOfferedPriceInr != null && agentOfferedPriceInr >= floor) {
    return { action: "accept", priceInr: agentOfferedPriceInr };
  }

  const frac = CONCESSION_FRACTIONS[Math.min(landlordReplyRoundIndex, CONCESSION_FRACTIONS.length - 1)];
  const counterPriceInr = Math.max(floor, Math.round(asking * frac));
  return { action: "counter", priceInr: counterPriceInr };
}

function landlordReplyEmail(listing: Listing, decision: LandlordDecision): string {
  if (decision.action === "accept") {
    return `Hi,

${inr(decision.priceInr)}/month works for us — happy to move forward with "${listing.title}" at that rate. Let us know the next steps.

Best,
${listing.landlordName}`;
  }

  return `Hi,

Thanks for your interest in "${listing.title}". We can do ${inr(decision.priceInr)}/month — let us know if that works for you.

Best,
${listing.landlordName}`;
}

// ---------------------------------------------------------------------------

export async function runLandlordAutoResponderOnce(): Promise<{ threadsHandled: number }> {
  const state = loadState();
  const pollStartedAt = Date.now();

  const newMessages = await checkInbox({
    account: "landlord",
    sinceTimestamp: state.lastPolledAt,
  });

  // One reply per thread per pass, even if multiple messages arrived.
  const latestByThread = new Map<string, (typeof newMessages)[number]>();
  for (const msg of newMessages) {
    latestByThread.set(msg.threadId, msg);
  }

  let threadsHandled = 0;

  for (const threadId of latestByThread.keys()) {
    const allMessages = await readThread({ account: "landlord", threadId });
    if (allMessages.length === 0) continue;

    const listingId = extractListingRef(allMessages[0].subject);
    const listing = listingId ? listingById.get(listingId) : undefined;
    if (!listing) continue; // not one of ours — ignore

    const latest = allMessages[allMessages.length - 1];
    const landlordEmail = accountEmail("landlord");
    const landlordReplyRoundIndex = allMessages.filter((m) =>
      m.from.toLowerCase().includes(landlordEmail.toLowerCase())
    ).length; // how many times we (the landlord side) have already replied in this thread

    const agentOfferedPriceInr = extractPriceInr(latest.body);
    const decision = landlordDecide(listing, agentOfferedPriceInr, landlordReplyRoundIndex);
    const body = landlordReplyEmail(listing, decision);

    const to = extractEmailAddress(latest.from);
    await sendEmail({
      account: "landlord",
      to,
      subject: allMessages[0].subject.startsWith("Re:")
        ? allMessages[0].subject
        : `Re: ${allMessages[0].subject}`,
      body,
      threadId,
      inReplyToMessageId: latest.messageId,
    });

    if (!state.seenThreadIds.includes(threadId)) state.seenThreadIds.push(threadId);
    threadsHandled++;
  }

  state.lastPolledAt = pollStartedAt;
  saveState(state);

  return { threadsHandled };
}

export async function runLandlordAutoResponderLoop(
  intervalMs: number,
  maxIterations = Infinity
): Promise<void> {
  let iteration = 0;
  while (iteration < maxIterations) {
    const { threadsHandled } = await runLandlordAutoResponderOnce();
    console.log(
      `[landlord-responder] iteration ${iteration + 1}: replied to ${threadsHandled} thread(s).`
    );
    iteration++;
    if (iteration >= maxIterations) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
