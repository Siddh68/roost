// The centerpiece: poll -> parse -> decide -> act. See BUILD_SPEC.md 5.3.
//
// Guardrails (price ceiling, floor, round caps) live entirely in policy.ts
// and are never left to anything learned. Intent classification comes from
// a trained Naive Bayes model that keeps learning during use (ml/intentModel.ts
// — no LLM, no API key), the in-range concession size comes from a small
// online-learned linear model (ml/concessionModel.ts), and the outbound
// email prose comes from fixed templates (emailTemplates.ts) parameterized
// with whatever move policy.ts has decided on.

import type { Listing } from "@roost/mcp-server/types";
import { loadListings } from "@roost/mcp-server/tools/searchListings";
import {
  sendEmail,
  checkInbox,
  readThread,
  accountEmail,
  type ThreadMessage,
} from "@roost/mcp-server/tools/emailAgent";
import {
  createThread,
  getDeal,
  getDealOwnerEmail,
  getActiveThreadsByDeal,
  updateThread,
  updateDealStatus,
  appendTranscript,
  getThreadsByDeal,
  listAllDeals,
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
  clientDealWonEmail,
  clientDealLostEmail,
  clientOutreachStartedEmail,
  clientMoveUpdateEmail,
  postAcceptanceAckEmail,
  priceChangeHoldingReplyEmail,
  priceChangeOverBudgetEmail,
  priceChangeConfirmationToClientEmail,
} from "./emailTemplates.js";
import { extractPriceInr } from "./ruleBasedNlu.js";
import { getDealClientThread, setPendingPriceChange, updateLastClientMessageId } from "../db/clientThreadRegistry.js";
import { loadAgentState, saveAgentState } from "../db/agentState.js";

const CONCESSION_MODEL_DB_KEY = "concessionModel";

// Gmail's search index can lag a few seconds behind actual delivery — a
// poll cursor that jumps straight to "now" every cycle can race past a
// message that hasn't been indexed yet and never see it again. Keeping the
// cursor a minute behind wall-clock time gives every message a full extra
// poll cycle of overlap to show up in, at the cost of nothing since
// already-handled messages/threads are safely no-ops on a re-check.
const POLL_SAFETY_BUFFER_MS = 60_000;

let concessionModel: ConcessionModel | null = null;
async function getConcessionModel(): Promise<ConcessionModel> {
  if (!concessionModel) {
    try {
      const saved = await loadAgentState<ReturnType<ConcessionModel["toJSON"]>>(CONCESSION_MODEL_DB_KEY);
      concessionModel = saved ? ConcessionModel.fromJSON(saved) : new ConcessionModel();
    } catch (err) {
      // A bad row here must never permanently wedge every poll cycle — a
      // fresh cold-start model is far better than every deal in every
      // cycle throwing forever.
      console.error("[stateMachine] concession model load failed, resetting:", err);
      concessionModel = new ConcessionModel();
    }
  }
  return concessionModel;
}
async function saveConcessionModel(): Promise<void> {
  const model = await getConcessionModel();
  await saveAgentState(CONCESSION_MODEL_DB_KEY, model.toJSON());
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

export function subjectFor(listing: Listing): string {
  return `Office space inquiry — ${listing.title} [ref:${listing.id}]`;
}

/**
 * Sends a standalone update email to the account that owns this deal, for
 * every negotiation move — but only for deals created on the website. A
 * deal that came in through the email-intake pipeline already has a
 * registered clientThreadRegistry entry and gets its own (threaded, reply-
 * into-the-original-email) notifications from clientIntake.ts/the WON/LOST
 * path below; sending this too would double them up. Failures here are
 * logged and swallowed — a notification email failing must never break the
 * actual negotiation it's reporting on.
 */
async function notifyDealOwner(dealId: string, subject: string, body: string): Promise<void> {
  try {
    const clientThread = await getDealClientThread(dealId);
    if (clientThread) return;

    const ownerEmail = await getDealOwnerEmail(dealId);
    if (!ownerEmail) return;

    await sendEmail({ account: "agent", to: ownerEmail, subject, body });
  } catch (err) {
    console.error(`[stateMachine] owner notification failed for deal ${dealId}:`, err);
  }
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
    const openingOfferInr = openingCounterPriceInr(listing.monthlyRentInr, profile);
    const body = outreachEmail(listing, profile, openingOfferInr);
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
      currentOfferInr: openingOfferInr,
    });

    await appendTranscript({
      dealId,
      threadId,
      type: "outreach_sent",
      payload: { listingId, subject, body, messageId },
    });
  }

  await updateDealStatus(dealId, "NEGOTIATING");
  await notifyDealOwner(
    dealId,
    "We've started negotiating on your shortlist",
    clientOutreachStartedEmail(listingIds.length)
  );
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

  const statusBefore = deal.status;
  await reconcileDealStatus(dealId);
  if (threadsWithActivity > 0) {
    await notifyClientOnResolution(dealId, statusBefore);
  }

  // Terms being accepted doesn't mean the landlord stops emailing — lease
  // logistics, follow-up questions, etc. keep coming. Without this, any
  // message on an "accepted" thread was silently dropped forever.
  threadsWithActivity += await pollAcceptedThreads(dealId);

  return { threadsWithActivity };
}

/** Checks every "accepted" thread on a deal for new landlord messages and acknowledges them — keeps the conversation responsive after terms are locked instead of going silent. */
export async function pollAcceptedThreads(dealId: string): Promise<number> {
  const threads = await getThreadsByDeal(dealId);
  const accepted = threads.filter((t) => t.status === "accepted");
  let handled = 0;

  for (const thread of accepted) {
    const previousPolledAt = thread.lastPolledAt;
    const newMessages = await checkInbox({
      account: "agent",
      threadIds: [thread.id],
      sinceTimestamp: previousPolledAt,
    });
    await updateThread(thread.id, { lastPolledAt: Date.now() - POLL_SAFETY_BUFFER_MS });
    if (newMessages.length === 0) continue;

    const listing = getListingOrThrow(thread.listingId);
    const allMessages = await readThread({ account: "agent", threadId: thread.id });
    const latest = allMessages[allMessages.length - 1];

    await appendTranscript({
      dealId,
      threadId: thread.id,
      type: "reply_received",
      payload: { from: latest.from, snippet: latest.body.slice(0, 160) },
    });

    const deal = await getDeal(dealId);
    // A price can be stated in one message and then followed by something
    // short and price-free ("done", "ok", "let me know") that would
    // otherwise bury it — scan every genuinely new incoming message this
    // cycle (not just the last one) for the most recent price mention.
    const agentEmail = accountEmail("agent").toLowerCase();
    const newIncoming = allMessages.filter(
      (m) => m.date > previousPolledAt && !m.from.toLowerCase().includes(agentEmail)
    );
    let revisedPrice: number | null = null;
    for (let i = newIncoming.length - 1; i >= 0; i--) {
      revisedPrice = extractPriceInr(newIncoming[i].body);
      if (revisedPrice != null) break;
    }
    const priceChanged = revisedPrice != null && revisedPrice !== thread.currentOfferInr;

    let action: string;
    let body: string;

    if (priceChanged && deal && revisedPrice! > deal.companyProfile.budgetInr) {
      // Hard ceiling — never crossed, no client check needed, decided on the spot.
      action = "price_change_over_budget";
      body = priceChangeOverBudgetEmail({ listing, previousPriceInr: thread.currentOfferInr });
    } else if (priceChanged && deal) {
      const clientThread = await getDealClientThread(dealId);
      if (clientThread) {
        // Within budget but a real change from what was agreed — the
        // client already got a "deal reached" email at the old number,
        // so we ask before silently re-confirming at a different one.
        await sendEmail({
          account: "agent",
          to: clientThread.clientEmail,
          cc: clientThread.cc,
          subject: "Landlord wants to revise the price",
          body: priceChangeConfirmationToClientEmail({
            listing,
            newPriceInr: revisedPrice!,
            previousPriceInr: thread.currentOfferInr,
          }),
          threadId: clientThread.threadId,
          inReplyToMessageId: clientThread.lastMessageId,
        });
        await setPendingPriceChange(dealId, {
          landlordThreadId: thread.id,
          listingId: thread.listingId,
          newPriceInr: revisedPrice!,
          previousPriceInr: thread.currentOfferInr,
        });
        action = "price_change_holding";
        body = priceChangeHoldingReplyEmail(listing);
      } else {
        // No registered client thread (e.g. a CLI/dashboard-created deal)
        // to ask — fall back to the safe generic ack rather than
        // unilaterally accepting a different price with no one to confirm with.
        action = "post_acceptance_ack";
        body = postAcceptanceAckEmail(listing);
      }
    } else {
      action = "post_acceptance_ack";
      body = postAcceptanceAckEmail(listing);
    }

    const sent = await sendEmail({
      account: "agent",
      to: thread.landlordEmail,
      subject: `Re: ${subjectFor(listing)}`,
      body,
      threadId: thread.id,
      inReplyToMessageId: latest.messageId,
    });
    await updateThread(thread.id, { lastMessageId: sent.messageId });

    await appendTranscript({
      dealId,
      threadId: thread.id,
      type: "response_sent",
      payload: { action, body },
    });
    handled++;
  }

  return handled;
}

/**
 * Emails the client the moment their deal resolves (landlord accepted, or
 * every thread closed without a deal) — the other half of "the agent
 * handles everything," not just the landlord side. Always replies into the
 * ONE Gmail thread the client originally emailed in on (via
 * clientThreadRegistry, populated by clientIntake.ts) — never a fresh
 * thread, so there's exactly one conversation per deal on both sides.
 * Deals with no registered client thread (e.g. created via the CLI/web
 * dashboard, not an inbound email) are skipped — nothing to reply into.
 */
async function notifyClientOnResolution(dealId: string, statusBefore: Deal["status"]): Promise<void> {
  const dealNow = await getDeal(dealId);
  if (!dealNow || dealNow.status === statusBefore) return; // no transition this pass
  if (dealNow.status !== "WON" && dealNow.status !== "LOST") return;

  let body: string;
  if (dealNow.status === "WON") {
    const threads = await getThreadsByDeal(dealId);
    const won = threads.find((t) => t.status === "accepted");
    if (!won) return;
    const listing = getListingOrThrow(won.listingId);
    body = clientDealWonEmail({
      listing,
      finalPriceInr: won.currentOfferInr,
      savingsInr: won.askingPriceInr - won.currentOfferInr,
    });
  } else {
    body = clientDealLostEmail();
  }
  const subject = dealNow.status === "WON" ? "Deal reached" : "Update on your office search";

  const clientThread = await getDealClientThread(dealId);
  if (clientThread) {
    const sent = await sendEmail({
      account: "agent",
      to: clientThread.clientEmail,
      cc: clientThread.cc,
      subject,
      body,
      threadId: clientThread.threadId,
      inReplyToMessageId: clientThread.lastMessageId,
    });
    await updateLastClientMessageId(dealId, sent.messageId);
    return;
  }

  // No email-intake thread — this deal was created on the website, so send
  // a standalone email to the account owner instead of replying in a thread.
  await notifyDealOwner(dealId, subject, body);
}

async function pollThread(deal: Deal, thread: NegotiationThread): Promise<boolean> {
  const newMessages = await checkInbox({
    account: "agent",
    threadIds: [thread.id],
    sinceTimestamp: thread.lastPolledAt,
  });

  await updateThread(thread.id, { lastPolledAt: Date.now() - POLL_SAFETY_BUFFER_MS });
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

  const classification = await classifyIntent(latest.body, effectiveCurrentOffer);

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
  const predictedFraction = concessionFeatures
    ? (await getConcessionModel()).predict(concessionFeatures)
    : undefined;

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
    const model = await getConcessionModel();
    for (let i = 0; i < 5; i++) model.update(features, target, 0.4);
    await saveConcessionModel();
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
      const sent = await sendReply({ thread, listing, to: thread.landlordEmail, body, inReplyTo: latest.messageId, cc: latest.cc });
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
      await notifyDealOwner(
        deal.id,
        `Deal reached — ${listing.title}`,
        clientMoveUpdateEmail({ listing, action: "accept", finalPriceInr: decision.finalPriceInr })
      );
      break;
    }

    case "counter": {
      const body = counterEmail({
        listing,
        counterPriceInr: decision.counterPriceInr,
        belowFloorFlag: decision.belowFloorFlag,
      });
      const sent = await sendReply({ thread, listing, to: thread.landlordEmail, body, inReplyTo: latest.messageId, cc: latest.cc });
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
      await notifyDealOwner(
        deal.id,
        `Countered on ${listing.title}`,
        clientMoveUpdateEmail({
          listing,
          action: "counter",
          landlordOfferedInr: args.nextLastLandlordOfferInr,
          counterPriceInr: decision.counterPriceInr,
        })
      );
      break;
    }

    case "answer_info": {
      const body = answerInfoEmail(listing, profile);
      const sent = await sendReply({ thread, listing, to: thread.landlordEmail, body, inReplyTo: latest.messageId, cc: latest.cc });
      await updateThread(thread.id, { ...baseThreadPatch, lastMessageId: sent.messageId });
      await appendTranscript({
        dealId: deal.id,
        threadId: thread.id,
        type: "response_sent",
        payload: { action: "answer_info", body },
      });
      await notifyDealOwner(
        deal.id,
        `Update on ${listing.title}`,
        clientMoveUpdateEmail({ listing, action: "answer_info" })
      );
      break;
    }

    case "closed_lost": {
      const body = closedLostEmail(listing);
      const sent = await sendReply({ thread, listing, to: thread.landlordEmail, body, inReplyTo: latest.messageId, cc: latest.cc });
      await updateThread(thread.id, { ...baseThreadPatch, status: "rejected", lastMessageId: sent.messageId });
      await appendTranscript({
        dealId: deal.id,
        threadId: thread.id,
        type: "response_sent",
        payload: { action: "closed_lost", body },
      });
      await notifyDealOwner(
        deal.id,
        `Closed — ${listing.title}`,
        clientMoveUpdateEmail({ listing, action: "closed_lost" })
      );
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
      await notifyDealOwner(
        deal.id,
        `Needs your input — ${listing.title}`,
        clientMoveUpdateEmail({ listing, action: "paused", reasoning: decision.reasoning })
      );
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
  cc?: string;
}) {
  return sendEmail({
    account: "agent",
    to: args.to,
    subject: `Re: ${subjectFor(args.listing)}`,
    body: args.body,
    threadId: args.thread.id,
    inReplyToMessageId: args.inReplyTo,
    cc: args.cc,
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

/**
 * Polls every NEGOTIATING and WON deal each cycle — unlike runPollLoop
 * (a single dealId), this picks up new deals as client-intake creates
 * them and keeps acknowledging post-acceptance landlord messages on
 * already-WON deals, so both sides stay fully automated with nothing to
 * start per-deal. Runs forever; call without awaiting alongside
 * runClientIntakeLoop to run both pollers in one process (see agent.js).
 */
export async function runPollAllLoop(intervalMs: number): Promise<void> {
  console.log(`Polling all active deals every ${intervalMs}ms (Ctrl+C to stop)...`);
  for (;;) {
    try {
      const deals = await listAllDeals();
      const active = deals.filter((d) => d.status === "NEGOTIATING" || d.status === "WON");
      let totalActivity = 0;
      for (const d of active) {
        const { threadsWithActivity } = await pollDealOnce(d.id);
        totalActivity += threadsWithActivity;
      }
      if (totalActivity > 0) {
        console.log(`[poll-all] ${totalActivity} thread(s) had activity across ${active.length} deal(s).`);
      }
    } catch (err) {
      console.error("[poll-all] poll error:", err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
