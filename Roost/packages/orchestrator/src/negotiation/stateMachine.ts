// The centerpiece: poll -> parse -> decide -> act. See BUILD_SPEC.md 5.3.
//
// Guardrails (price ceiling, floor, round caps) live entirely in policy.ts
// and are never left to anything learned. Intent classification comes from
// a trained Naive Bayes model that keeps learning during use (ml/intentModel.ts
// — no LLM, no API key), the in-range concession size comes from a small
// online-learned linear model (ml/concessionModel.ts), and the outbound
// email prose comes from fixed templates (emailTemplates.ts) parameterized
// with whatever move policy.ts has decided on.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Listing } from "@roost/mcp-server/types";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import {
  sendEmail,
  checkInbox,
  readThread,
  type ThreadMessage,
} from "@roost/mcp-server/tools/emailAgent";
import {
  createThread,
  getDeal,
  getActiveThreadsByDeal,
  updateThread,
  updateDealStatus,
  appendTranscript,
  getThreadsByDeal,
  type NegotiationThread,
  type Deal,
} from "../db/store.js";
import {
  decideMove,
  openingCounterPriceInr,
  priceCeiling,
  priceFloor,
  MAX_PRICE_MOVEMENT_ROUNDS,
  type PolicyContext,
} from "./policy.js";
import { classifyIntent } from "../ml/intentModel.js";
import { ConcessionModel, type ConcessionFeatures } from "../ml/concessionModel.js";
import {
  outreachEmail,
  acceptEmail,
  counterEmail,
  answerInfoEmail,
  closedLostEmail,
} from "./emailTemplates.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONCESSION_MODEL_PATH = join(__dirname, "..", "..", "data", "concessionModel.json");

let concessionModel: ConcessionModel | null = null;
function getConcessionModel(): ConcessionModel {
  if (!concessionModel) {
    concessionModel = ConcessionModel.load(CONCESSION_MODEL_PATH) ?? new ConcessionModel();
  }
  return concessionModel;
}
function saveConcessionModel(): void {
  getConcessionModel().save(CONCESSION_MODEL_PATH);
}

function computeConcessionFeatures(
  priceMovementRounds: number,
  currentOfferInr: number,
  offeredPriceInr: number,
  profile: PolicyContext["profile"]
): ConcessionFeatures {
  const range = Math.max(priceCeiling(profile) - priceFloor(profile), 1);
  return {
    priceMovementRoundsNorm: priceMovementRounds / MAX_PRICE_MOVEMENT_ROUNDS,
    gapRatio: (offeredPriceInr - currentOfferInr) / range,
  };
}

const listingById = new Map<string, Listing>(loadListings().map((l) => [l.id, l]));

function getListingOrThrow(listingId: string): Listing {
  const listing = listingById.get(listingId);
  if (!listing) throw new Error(`Unknown listing id: ${listingId}`);
  return listing;
}

function subjectFor(listing: Listing): string {
  return `Office space inquiry — ${listing.title} [ref:${listing.id}]`;
}

// ---------------------------------------------------------------------------
// Outreach: initial cold emails to the top N shortlisted listings.
// ---------------------------------------------------------------------------

export async function startOutreach(dealId: string, listingIds: string[]): Promise<void> {
  const deal = await getDeal(dealId);
  if (!deal) throw new Error(`Unknown deal id: ${dealId}`);
  const profile = deal.companyProfile;

  for (const listingId of listingIds) {
    const listing = getListingOrThrow(listingId);
    const body = outreachEmail(listing, profile);
    const subject = subjectFor(listing);
    const { threadId, messageId } = await sendEmail({
      account: "agent",
      to: listing.landlordEmail,
      subject,
      body,
    });

    await createThread({
      threadId,
      dealId,
      listingId,
      landlordEmail: listing.landlordEmail,
      askingPriceInr: listing.monthlyRentInr,
    });

    await appendTranscript({
      dealId,
      threadId,
      type: "outreach_sent",
      payload: { listingId, subject, body, messageId },
    });
  }

  await updateDealStatus(dealId, "NEGOTIATING");
}

// ---------------------------------------------------------------------------
// One poll pass: check every active thread for a deal, process new replies.
// ---------------------------------------------------------------------------

export async function pollDealOnce(dealId: string): Promise<{ threadsWithActivity: number }> {
  const deal = await getDeal(dealId);
  if (!deal) throw new Error(`Unknown deal id: ${dealId}`);

  const activeThreads = await getActiveThreadsByDeal(dealId);
  let threadsWithActivity = 0;

  for (const thread of activeThreads) {
    const didAct = await pollThread(deal, thread);
    if (didAct) threadsWithActivity++;
  }

  await reconcileDealStatus(dealId);
  return { threadsWithActivity };
}

async function pollThread(deal: Deal, thread: NegotiationThread): Promise<boolean> {
  const newMessages = await checkInbox({
    account: "agent",
    threadIds: [thread.id],
    sinceTimestamp: thread.lastPolledAt,
  });

  await updateThread(thread.id, { lastPolledAt: Date.now() });
  if (newMessages.length === 0) return false;

  const listing = getListingOrThrow(thread.listingId);
  const profile = deal.companyProfile;
  const allMessages = await readThread({ account: "agent", threadId: thread.id });
  const latest = allMessages[allMessages.length - 1];

  await appendTranscript({
    dealId: deal.id,
    threadId: thread.id,
    type: "reply_received",
    payload: { from: latest.from, snippet: latest.body.slice(0, 160) },
  });

  const effectiveCurrentOffer =
    thread.roundsUsed === 0
      ? openingCounterPriceInr(thread.askingPriceInr, profile)
      : thread.currentOfferInr;

  const classification = classifyIntent(latest.body, effectiveCurrentOffer);

  await appendTranscript({
    dealId: deal.id,
    threadId: thread.id,
    type: "intent_classified",
    payload: { ...classification },
  });

  // Predict a concession fraction whenever there's a price to react to — cheap
  // to compute, and decideMove() only uses it on the in-range ladder branch.
  const concessionFeatures =
    classification.offeredPriceInr != null
      ? computeConcessionFeatures(
          thread.priceMovementRounds,
          effectiveCurrentOffer,
          classification.offeredPriceInr,
          profile
        )
      : null;
  const predictedFraction = concessionFeatures ? getConcessionModel().predict(concessionFeatures) : undefined;

  const ctx: PolicyContext = {
    intent: classification.intent,
    offeredPriceInr: classification.offeredPriceInr,
    askingPriceInr: thread.askingPriceInr,
    currentOfferInr: effectiveCurrentOffer,
    previousLandlordOfferInr: thread.lastLandlordOfferInr,
    profile,
    roundsUsed: thread.roundsUsed,
    priceMovementRounds: thread.priceMovementRounds,
    noMovementStreak: thread.noMovementStreak,
    concessionFraction: predictedFraction,
  };
  const decision = decideMove(ctx);

  await appendTranscript({
    dealId: deal.id,
    threadId: thread.id,
    type: "policy_decision",
    payload: { ...decision },
  });

  const nextLastLandlordOfferInr =
    classification.intent === "counter_offer" && classification.offeredPriceInr != null
      ? classification.offeredPriceInr
      : thread.lastLandlordOfferInr;

  await act({
    deal,
    thread,
    listing,
    latest,
    decision,
    effectiveCurrentOffer,
    nextLastLandlordOfferInr,
    concessionFeatures,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Act on a policy decision: write the email (if any), send it, persist state.
// ---------------------------------------------------------------------------

async function act(args: {
  deal: Deal;
  thread: NegotiationThread;
  listing: Listing;
  latest: ThreadMessage;
  decision: ReturnType<typeof decideMove>;
  effectiveCurrentOffer: number;
  nextLastLandlordOfferInr: number | null;
  concessionFeatures: ConcessionFeatures | null;
}): Promise<void> {
  const { deal, thread, listing, latest, decision } = args;
  const profile = deal.companyProfile;

  const baseThreadPatch = {
    roundsUsed: thread.roundsUsed + 1,
    lastLandlordOfferInr: args.nextLastLandlordOfferInr,
    noMovementStreak: decision.nextNoMovementStreak,
  };

  /**
   * "Learns from its mistakes": when a thread reaches a terminal state, look
   * at the concession decision that led there (persisted on the thread from
   * the previous round) and give the model one online gradient step —
   * stalling nudges it to concede more next time in similar situations;
   * closing gives a small reinforcing update toward the fraction used.
   */
  async function updateConcessionModelOnTerminal(outcome: "accepted" | "stalled"): Promise<void> {
    if (thread.lastConcessionFeaturesJson == null || thread.lastConcessionFraction == null) return;
    const features = JSON.parse(thread.lastConcessionFeaturesJson) as ConcessionFeatures;
    const usedFraction = thread.lastConcessionFraction;
    const target =
      outcome === "accepted"
        ? usedFraction
        : Math.min(1, usedFraction + 0.25);
    // A single SGD step barely moves a sigmoid — take a handful of gradient
    // steps toward this one real outcome so it registers as a visible
    // behavior shift rather than an imperceptible nudge (this hackathon demo
    // will see a few real outcomes, not thousands of training examples).
    const model = getConcessionModel();
    for (let i = 0; i < 5; i++) model.update(features, target, 0.4);
    saveConcessionModel();
    await appendTranscript({
      dealId: deal.id,
      threadId: thread.id,
      type: "policy_decision",
      payload: {
        action: "concession_model_update",
        outcome,
        usedFraction,
        target,
        reasoning:
          outcome === "stalled"
            ? "This thread stalled — nudging the model to concede faster in similar situations."
            : "This thread closed successfully — reinforcing the fraction that got us there.",
      },
    });
  }

  switch (decision.action) {
    case "accept": {
      await updateConcessionModelOnTerminal("accepted");
      const body = acceptEmail(listing, decision.finalPriceInr);
      const sent = await sendReply({ thread, listing, to: thread.landlordEmail, body, inReplyTo: latest.messageId });
      await updateThread(thread.id, {
        ...baseThreadPatch,
        status: "accepted",
        currentOfferInr: decision.finalPriceInr,
        lastMessageId: sent.messageId,
      });
      await appendTranscript({
        dealId: deal.id,
        threadId: thread.id,
        type: "response_sent",
        payload: { action: "accept", body, finalPriceInr: decision.finalPriceInr },
      });
      break;
    }

    case "counter": {
      const body = counterEmail({
        listing,
        counterPriceInr: decision.counterPriceInr,
        belowFloorFlag: decision.belowFloorFlag,
      });
      const sent = await sendReply({ thread, listing, to: thread.landlordEmail, body, inReplyTo: latest.messageId });
      await updateThread(thread.id, {
        ...baseThreadPatch,
        currentOfferInr: decision.counterPriceInr,
        priceMovementRounds: thread.priceMovementRounds + (decision.countsAsLadderMovement ? 1 : 0),
        lastMessageId: sent.messageId,
        ...(decision.countsAsLadderMovement && decision.usedConcessionFraction != null && args.concessionFeatures
          ? {
              lastConcessionFeaturesJson: JSON.stringify(args.concessionFeatures),
              lastConcessionFraction: decision.usedConcessionFraction,
            }
          : {}),
      });
      await appendTranscript({
        dealId: deal.id,
        threadId: thread.id,
        type: "response_sent",
        payload: { action: "counter", body, counterPriceInr: decision.counterPriceInr },
      });
      break;
    }

    case "answer_info": {
      const body = answerInfoEmail(listing, profile);
      const sent = await sendReply({ thread, listing, to: thread.landlordEmail, body, inReplyTo: latest.messageId });
      await updateThread(thread.id, { ...baseThreadPatch, lastMessageId: sent.messageId });
      await appendTranscript({
        dealId: deal.id,
        threadId: thread.id,
        type: "response_sent",
        payload: { action: "answer_info", body },
      });
      break;
    }

    case "closed_lost": {
      const body = closedLostEmail(listing);
      const sent = await sendReply({ thread, listing, to: thread.landlordEmail, body, inReplyTo: latest.messageId });
      await updateThread(thread.id, { ...baseThreadPatch, status: "rejected", lastMessageId: sent.messageId });
      await appendTranscript({
        dealId: deal.id,
        threadId: thread.id,
        type: "response_sent",
        payload: { action: "closed_lost", body },
      });
      break;
    }

    case "stop_floor_breach":
    case "stop_round_limit": {
      // Internal stop — no email sent, just halt automated action and flag for review.
      // Both stall reasons collapse to the DB's "escalated" status; the specific
      // reason (decision.action) still lives in this stop_condition payload.
      await updateConcessionModelOnTerminal("stalled");
      await updateThread(thread.id, { ...baseThreadPatch, status: "escalated" });
      await appendTranscript({
        dealId: deal.id,
        threadId: thread.id,
        type: "stop_condition",
        payload: { reason: decision.action, reasoning: decision.reasoning },
      });
      break;
    }
  }
}

async function sendReply(args: {
  thread: NegotiationThread;
  listing: Listing;
  to: string;
  body: string;
  inReplyTo: string;
}) {
  return sendEmail({
    account: "agent",
    to: args.to,
    subject: `Re: ${subjectFor(args.listing)}`,
    body: args.body,
    threadId: args.thread.id,
    inReplyToMessageId: args.inReplyTo,
  });
}

// ---------------------------------------------------------------------------
// Deal-level status reconciliation + demo polling loop.
// ---------------------------------------------------------------------------

async function reconcileDealStatus(dealId: string): Promise<void> {
  const threads = await getThreadsByDeal(dealId);
  if (threads.length === 0) return;
  const anyAccepted = threads.some((t) => t.status === "accepted");
  const allResolved = threads.every((t) => t.status !== "active");
  if (anyAccepted) {
    await updateDealStatus(dealId, "WON");
  } else if (allResolved) {
    await updateDealStatus(dealId, "LOST");
  }
}

export async function runPollLoop(
  dealId: string,
  intervalMs: number,
  maxIterations = Infinity
): Promise<void> {
  let iteration = 0;
  while (iteration < maxIterations) {
    const deal = await getDeal(dealId);
    if (!deal || deal.status === "WON" || deal.status === "LOST") {
      console.log(`[poll] deal ${dealId} is resolved — stopping loop.`);
      return;
    }

    const { threadsWithActivity } = await pollDealOnce(dealId);
    console.log(
      `[poll] iteration ${iteration + 1}: ${threadsWithActivity} thread(s) had activity.`
    );

    iteration++;
    if (iteration >= maxIterations) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
