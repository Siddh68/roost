// Automated client-side intake: discovery-polls the agent's inbox for real
// inbound client emails (not landlord negotiation replies, which the
// existing stateMachine.ts poll loop already owns), parses their
// requirements with clientIntakeNlu.ts (no LLM), and — the moment we can
// parse a usable profile — immediately runs search/score/shortlist, replies
// to the client with the shortlist, and kicks off landlord outreach so the
// whole thing is live within one poll cycle, no human in the loop.

import { sendEmail, checkInbox, readThread, accountEmail } from "@roost/mcp-server/tools/emailAgent";
import { scoreListing } from "@roost/mcp-server/tools/scoreListing";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import { getOrCreateClientProfile, createCompanyProfile, createDeal, listDealsByUser, updateThread } from "../db/store.js";
import {
  clientShortlistEmail,
  clientFollowUpAckEmail,
  clientRequirementsPromptEmail,
  priceChangeConfirmedToLandlordEmail,
  priceChangeRejectedToLandlordEmail,
} from "./emailTemplates.js";
import { startOutreach, subjectFor } from "./stateMachine.js";
import { heuristicToneLabel } from "./ruleBasedNlu.js";
import { parseClientIntake } from "./clientIntakeNlu.js";
import {
  recordDealClientThread,
  updateLastClientMessageId,
  getDealClientThread,
  clearPendingPriceChange,
} from "../db/clientThreadRegistry.js";
import { loadAgentState, saveAgentState } from "../db/agentState.js";

const STATE_DB_KEY = "clientIntakeState";

const DEFAULT_FALLBACK_AREA = "Lower Parel"; // Mumbai-only demo — see searchListings.ts's ACTIVE_LISTING_ID_PREFIX
const SHORTLIST_SIZE = 3;

// See the matching constant/comment in stateMachine.ts — Gmail's search
// index lags actual delivery by a few seconds, so jumping the cursor
// straight to "now" every cycle can permanently skip a message that
// wasn't indexed yet at poll time. Keep a minute of overlap.
const POLL_SAFETY_BUFFER_MS = 60_000;

interface IntakeThreadState {
  status: "awaiting_requirements" | "processed";
  dealId?: string;
}

interface IntakeState {
  lastPolledAt: number;
  threads: Record<string, IntakeThreadState>;
}

const FRESH_STATE = (): IntakeState => ({ lastPolledAt: Date.now() - 1000 * 60 * 60 * 24, threads: {} });

async function loadState(): Promise<IntakeState> {
  try {
    const saved = await loadAgentState<IntakeState>(STATE_DB_KEY);
    return saved ?? FRESH_STATE();
  } catch (err) {
    // Corrupted/unreachable state must never permanently kill the poll
    // loop — that's silent, total downtime until someone notices and
    // manually fixes it. Recover with a fresh state (worst case: a couple
    // of clients get a duplicate "we're on it" ack, never nothing at all)
    // instead of letting loadState() throw and crash every cycle.
    console.error("[client-intake] state load failed, resetting:", err);
    return FRESH_STATE();
  }
}

async function saveState(state: IntakeState): Promise<void> {
  await saveAgentState(STATE_DB_KEY, state);
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
  const state = await loadState();
  const sinceTimestamp = state.lastPolledAt;
  const nowTimestamp = Date.now();

  const discovered = await checkInbox({ account: "agent", sinceTimestamp });
  let handled = 0;

  for (const message of discovered) {
    if (isLandlordSender(message.from)) continue; // owned by the negotiation poll loop

    // Everything below this point is wrapped so one message's failure
    // (a transient Gmail error, a rate limit) can never discard the whole
    // batch's progress. Before this fix, state.threads mutations only
    // reached the DB via the single saveState() call after the entire
    // loop finished — if a LATER message in the same batch threw, the
    // exception propagated out of pollClientIntakeOnce entirely, and that
    // final saveState() never ran. Confirmed live: a deal got created and
    // its shortlist/outreach partially ran, but the thread was never
    // marked "processed" because a later step in the same cycle threw, so
    // lastPolledAt never advanced either - the same message got
    // rediscovered next cycle, found the deal already existed, and sent a
    // generic "already in progress" ack instead of ever delivering the
    // real shortlist. Saving state after every message (not just once at
    // the end) means an earlier message's real, already-sent work is
    // never silently lost to a later one's failure.
    try {
      if (await processIntakeMessage(state, message)) handled++;
    } catch (err) {
      console.error(`[client-intake] error processing thread ${message.threadId}:`, err);
    } finally {
      await saveState(state);
    }
  }

  state.lastPolledAt = nowTimestamp - POLL_SAFETY_BUFFER_MS;
  await saveState(state);
  return { handled };
}

async function processIntakeMessage(
  state: IntakeState,
  message: Awaited<ReturnType<typeof checkInbox>>[number]
): Promise<boolean> {
  const existing = state.threads[message.threadId];

  const thread = await readThread({ account: "agent", threadId: message.threadId });
  const latest = thread[thread.length - 1];
  if (!latest) return false;

  const senderEmail = extractSenderEmail(latest.from);
  const senderName = extractSenderName(latest.from);

  // Skip our own sent messages (the initial ask, shortlist reply, etc.) surfacing back in discovery.
  if (senderEmail === accountEmail("agent").toLowerCase()) return false;

  // Already processed this thread's intake — any further message is a
  // follow-up, not a fresh submission. Acknowledge it so nothing goes
  // silently unanswered, but don't re-run intake or re-send outreach.
  if (existing?.status === "processed") {
    const clientThread = existing.dealId ? await getDealClientThread(existing.dealId) : null;
    const pending = clientThread?.pendingPriceChange;

    if (existing.dealId && pending) {
      // The landlord asked to change an already-accepted price and
      // we're waiting on exactly this: does the client agree or not.
      const tone = heuristicToneLabel(latest.body);
      const listing = loadListings().find((l) => l.id === pending.listingId);

      if (tone === "agreement" && listing) {
        await sendEmail({
          account: "agent",
          to: senderEmail,
          cc: latest.cc,
          subject: `Re: ${latest.subject}`,
          body: `Confirmed — we'll let the landlord know ${pending.newPriceInr.toLocaleString("en-IN")}/month works.`,
          threadId: message.threadId,
          inReplyToMessageId: latest.messageId,
        });
        await sendEmail({
          account: "agent",
          to: listing.landlordEmail,
          subject: `Re: ${subjectFor(listing)}`,
          body: priceChangeConfirmedToLandlordEmail(listing, pending.newPriceInr),
          threadId: pending.landlordThreadId,
        });
        await updateThread(pending.landlordThreadId, { currentOfferInr: pending.newPriceInr });
        await clearPendingPriceChange(existing.dealId);
      } else if (tone === "decline" && listing) {
        await sendEmail({
          account: "agent",
          to: senderEmail,
          cc: latest.cc,
          subject: `Re: ${latest.subject}`,
          body: `Understood — we'll hold at the originally agreed ${pending.previousPriceInr.toLocaleString("en-IN")}/month with the landlord.`,
          threadId: message.threadId,
          inReplyToMessageId: latest.messageId,
        });
        await sendEmail({
          account: "agent",
          to: listing.landlordEmail,
          subject: `Re: ${subjectFor(listing)}`,
          body: priceChangeRejectedToLandlordEmail(listing, pending.previousPriceInr),
          threadId: pending.landlordThreadId,
        });
        await clearPendingPriceChange(existing.dealId);
      } else {
        // Couldn't tell yes/no from this reply — ask again rather than guess on a real price decision.
        await sendEmail({
          account: "agent",
          to: senderEmail,
          cc: latest.cc,
          subject: `Re: ${latest.subject}`,
          body: `Just to confirm — are you okay with ${pending.newPriceInr.toLocaleString("en-IN")}/month, or should we hold at the original ${pending.previousPriceInr.toLocaleString("en-IN")}/month?`,
          threadId: message.threadId,
          inReplyToMessageId: latest.messageId,
        });
      }
      return true;
    }

    const sent = await sendEmail({
      account: "agent",
      to: senderEmail,
      cc: latest.cc,
      subject: `Re: ${latest.subject}`,
      body: clientFollowUpAckEmail(),
      threadId: message.threadId,
      inReplyToMessageId: latest.messageId,
    });
    if (existing.dealId) await updateLastClientMessageId(existing.dealId, sent.messageId);
    return true;
  }

  const parsed = parseClientIntake(latest.body, DEFAULT_FALLBACK_AREA);

  if (!parsed.profile) {
    // Cold "I'm interested" messages, questions, anything we can't turn
    // into a profile yet — always reply asking for what's missing,
    // never go silent. Covers both the very first message on a new
    // thread and a repeat reply that still didn't include everything.
    const sent = await sendEmail({
      account: "agent",
      to: senderEmail,
      cc: latest.cc,
      subject: `Re: ${latest.subject}`,
      body: clientRequirementsPromptEmail(parsed.missingFields),
      threadId: message.threadId,
      inReplyToMessageId: latest.messageId,
    });
    if (existing?.dealId) await updateLastClientMessageId(existing.dealId, sent.messageId);
    state.threads[message.threadId] = { status: "awaiting_requirements" };
    return true;
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
    await updateLastClientMessageId(activeDeal.id, sent.messageId);
    state.threads[message.threadId] = { status: "processed", dealId: activeDeal.id };
    return true;
  }

  const search = await createCompanyProfile({
    userId: client.id,
    label: `Client intake — ${senderEmail}`,
    profile: parsed.profile,
  });
  const deal = await createDeal(search.id);

  // Record the profile/deal <-> thread link BEFORE anything else that can
  // fail (scoring, the shortlist email, outreach) — otherwise a failure in
  // one of those steps leaves the deal created but with no way to resume
  // into it: the next attempt at this same message finds no state.threads
  // entry, treats it as fresh, and duplicates the CompanyProfile/Deal
  // instead of continuing the one already made.
  state.threads[message.threadId] = { status: "processed", dealId: deal.id };

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
  await recordDealClientThread(deal.id, {
    threadId: message.threadId,
    lastMessageId: sentReply.messageId,
    clientEmail: senderEmail,
    cc: latest.cc,
  });

  await startOutreach(
    deal.id,
    scored.map((s) => s.listing.id)
  );

  return true;
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
