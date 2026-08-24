// Automated client-side intake: discovery-polls the agent's inbox for real
// inbound client emails (not landlord negotiation replies, which the
// existing stateMachine.ts poll loop already owns), parses their
// requirements with clientIntakeNlu.ts (no LLM), and — the moment we can
// parse a usable profile — immediately runs search/score/shortlist, replies
// to the client with the shortlist, and kicks off landlord outreach so the
// whole thing is live within one poll cycle, no human in the loop.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sendEmail, checkInbox, readThread } from "@roost/mcp-server/tools/emailAgent";
import { scoreListing } from "@roost/mcp-server/tools/scoreListing";
import { getOrCreateClientProfile, createCompanyProfile, createDeal, listDealsByUser } from "../db/store.js";
import { clientShortlistEmail, clientFollowUpAckEmail } from "./emailTemplates.js";
import { startOutreach } from "./stateMachine.js";
import { recordDealClientThread, updateLastClientMessageId } from "../db/clientThreadRegistry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, "..", "..", "data", ".clientIntakeState.json");

const DEFAULT_FALLBACK_AREA = "Koramangala";
const SHORTLIST_SIZE = 3;

interface IntakeThreadState {
  status: "awaiting_requirements" | "processed";
  dealId?: string;
}

interface IntakeState {
  lastPolledAt: number;
  threads: Record<string, IntakeThreadState>;
}

function loadState(): IntakeState {
  if (!existsSync(STATE_PATH)) return { lastPolledAt: Date.now() - 1000 * 60 * 60 * 24, threads: {} };
  return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as IntakeState;
}

function saveState(state: IntakeState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

function isLandlordSender(from: string): boolean {
  const landlordEmail = (process.env.GMAIL_LANDLORD_EMAIL ?? "").toLowerCase();
  return landlordEmail.length > 0 && from.toLowerCase().includes(landlordEmail);
}

function extractSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

function extractSenderName(from: string): string | null {
  const match = from.match(/^"?([^"<]+?)"?\s*</);
  return match ? match[1].trim() : null;
}

/** One discovery pass: finds new client threads, processes any we can act on immediately. Returns how many client replies were handled this pass. */
export async function pollClientIntakeOnce(): Promise<{ handled: number }> {
  const state = loadState();
  const sinceTimestamp = state.lastPolledAt;
  const nowTimestamp = Date.now();

  const discovered = await checkInbox({ account: "agent", sinceTimestamp });
  let handled = 0;

  for (const message of discovered) {
    if (isLandlordSender(message.from)) continue; // owned by the negotiation poll loop

    const existing = state.threads[message.threadId];

    const thread = await readThread({ account: "agent", threadId: message.threadId });
    const latest = thread[thread.length - 1];
    if (!latest) continue;

    const senderEmail = extractSenderEmail(latest.from);
    const senderName = extractSenderName(latest.from);

    // Skip our own sent messages (the initial ask, shortlist reply, etc.) surfacing back in discovery.
    if (senderEmail.includes("siddhjain68")) continue;

    // Already processed this thread's intake — any further message is a
    // follow-up, not a fresh submission. Acknowledge it so nothing goes
    // silently unanswered, but don't re-run intake or re-send outreach.
    if (existing?.status === "processed") {
      const sent = await sendEmail({
        account: "agent",
        to: senderEmail,
        cc: latest.cc,
        subject: `Re: ${latest.subject}`,
        body: clientFollowUpAckEmail(),
        threadId: message.threadId,
        inReplyToMessageId: latest.messageId,
      });
      if (existing.dealId) updateLastClientMessageId(existing.dealId, sent.messageId);
      handled++;
      continue;
    }

    const { parseClientIntake } = await import("./clientIntakeNlu.js");
    const parsed = parseClientIntake(latest.body, DEFAULT_FALLBACK_AREA);

    if (!parsed.profile) {
      state.threads[message.threadId] = { status: "awaiting_requirements" };
      continue; // don't nag on every field we can't parse — the original ask already covers this
    }

    const client = await getOrCreateClientProfile(senderEmail, senderName);

    // One active deal per client at a time — a second inbound thread from
    // the same person (a duplicate email, a "did you get this" resend)
    // must never spin up a second parallel set of landlord threads.
    const existingDeals = await listDealsByUser(client.id);
    const activeDeal = existingDeals.find((d) => d.status === "SHORTLISTED" || d.status === "NEGOTIATING");
    if (activeDeal) {
      const sent = await sendEmail({
        account: "agent",
        to: senderEmail,
        cc: latest.cc,
        subject: `Re: ${latest.subject}`,
        body: clientFollowUpAckEmail(),
        threadId: message.threadId,
        inReplyToMessageId: latest.messageId,
      });
      updateLastClientMessageId(activeDeal.id, sent.messageId);
      state.threads[message.threadId] = { status: "processed", dealId: activeDeal.id };
      handled++;
      continue;
    }

    const search = await createCompanyProfile({
      userId: client.id,
      label: `Client intake — ${senderEmail}`,
      profile: parsed.profile,
    });
    const deal = await createDeal(search.id);

    const scored = scoreListing(parsed.profile).slice(0, SHORTLIST_SIZE);

    const replyBody = clientShortlistEmail({
      profile: parsed.profile,
      shortlist: scored.map((s) => ({
        listing: s.listing,
        totalScore: s.result.totalScore,
        reasoning: s.result.reasoning,
      })),
    });

    const sentReply = await sendEmail({
      account: "agent",
      to: senderEmail,
      cc: latest.cc,
      subject: `Re: ${latest.subject}`,
      body: replyBody,
      threadId: message.threadId,
      inReplyToMessageId: latest.messageId,
    });

    // From here on, every client-facing email for this deal (win/loss
    // outcome, more follow-ups) replies into this exact same thread.
    recordDealClientThread(deal.id, {
      threadId: message.threadId,
      lastMessageId: sentReply.messageId,
      clientEmail: senderEmail,
      cc: latest.cc,
    });

    await startOutreach(
      deal.id,
      scored.map((s) => s.listing.id)
    );

    state.threads[message.threadId] = { status: "processed", dealId: deal.id };
    handled++;
  }

  state.lastPolledAt = nowTimestamp;
  saveState(state);
  return { handled };
}

/** Runs pollClientIntakeOnce on an interval, for a standalone `npm run client-intake` process. */
export async function runClientIntakeLoop(intervalMs = 30000): Promise<void> {
  console.log(`Client intake poller running (interval ${intervalMs}ms). Ctrl+C to stop.`);
  for (;;) {
    try {
      const { handled } = await pollClientIntakeOnce();
      if (handled > 0) console.log(`[client-intake] handled ${handled} new client reply(ies).`);
    } catch (err) {
      console.error("[client-intake] poll error:", err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
