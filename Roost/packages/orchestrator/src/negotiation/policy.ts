// Hard-coded negotiation guardrails (BUILD_SPEC.md Section 5.3 / 5). These
// decisions are never left to the LLM — the model only classifies intent and
// writes the email prose; this module decides the actual negotiating move.
//
// Terminology, since the spec's naming is a little loose:
//   priceCeiling = CompanyProfile.budgetInr — hard cap, never exceeded.
//   priceFloor   = budgetInr * priceFloorPct — lower bound of the "sane deal"
//                  range. A landlord counter BELOW this is suspiciously
//                  cheap, so instead of grabbing it blindly we counter near
//                  the floor citing comparables (a sanity check, not greed).
//   acceptable range = [priceFloor, priceCeiling].
//
// Negotiation ladder: our own counters open ~10% under the landlord's asking
// price, then move toward whatever the landlord counters with by a fraction
// of the remaining gap — a fraction supplied by the caller (learned online
// by ml/concessionModel.ts; defaults to a neutral 0.5 split if omitted, e.g.
// in the deterministic policyCli.ts scenarios) — capped at 3 rounds of price
// movement. If the landlord holds above the ceiling with no real movement
// for 2 rounds running, or the thread hits 6 total rounds, we stop and
// escalate rather than keep negotiating forever. Whatever fraction the
// learned model proposes, the result is always clamped to [floor, ceiling]
// here — the model influences HOW MUCH we concede, never WHETHER the hard
// price guardrails hold.

import type { CompanyProfile } from "@roost/mcp-server/types";

export const MAX_PRICE_MOVEMENT_ROUNDS = 3;
export const MAX_TOTAL_ROUNDS = 6;
export const NO_MOVEMENT_STREAK_LIMIT = 2;
const OPENING_DISCOUNT_PCT = 0.1;
const MOVEMENT_TOLERANCE_PCT = 0.02;

export type NegotiationIntent =
  | "accept"
  | "counter_offer"
  | "reject"
  | "needs_info"
  | "off_topic";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function priceCeiling(profile: CompanyProfile): number {
  return profile.budgetInr;
}

export function priceFloor(profile: CompanyProfile): number {
  return Math.round(profile.budgetInr * profile.priceFloorPct);
}

/** Our opening counter, sent on the first substantive negotiation round. */
export function openingCounterPriceInr(
  askingPriceInr: number,
  profile: CompanyProfile
): number {
  const raw = Math.round(askingPriceInr * (1 - OPENING_DISCOUNT_PCT));
  // priceFloor/priceCeiling are derived purely from the company's budget, with
  // no idea what any given listing actually asks. For a listing priced well
  // under budget, clamping up to that budget-derived floor produced an
  // opening "counter" HIGHER than the landlord's own asking price — offering
  // more than what was asked for. We should never offer above the asking
  // price, so the effective ceiling for this listing is whichever is lower.
  return clamp(raw, priceFloor(profile), Math.min(priceCeiling(profile), askingPriceInr));
}

export interface PolicyContext {
  intent: NegotiationIntent;
  /** Price extracted from the landlord's message, if intent is counter_offer. */
  offeredPriceInr: number | null;
  askingPriceInr: number;
  /** Our last proposed price on this thread (starts at openingCounterPriceInr). */
  currentOfferInr: number;
  /** The landlord's price from the previous round, for movement detection. */
  previousLandlordOfferInr: number | null;
  profile: CompanyProfile;
  roundsUsed: number;
  priceMovementRounds: number;
  noMovementStreak: number;
  /** Fraction (0..1) of the gap to concede on an in-range ladder counter. Learned online; defaults to 0.5. */
  concessionFraction?: number;
}

export type PolicyDecision = {
  /** Updated no-movement streak to persist on the thread (0 unless still stuck above ceiling). */
  nextNoMovementStreak: number;
} & (
  | { action: "accept"; finalPriceInr: number; reasoning: string }
  | {
      action: "counter";
      counterPriceInr: number;
      belowFloorFlag: boolean;
      /** True only for in-range ladder counters — the kind capped at MAX_PRICE_MOVEMENT_ROUNDS. */
      countsAsLadderMovement: boolean;
      /** The concession fraction actually used, only set for ladder-movement counters (for later online model updates). */
      usedConcessionFraction?: number;
      reasoning: string;
    }
  | { action: "answer_info"; reasoning: string }
  | { action: "closed_lost"; reasoning: string }
  | { action: "stop_floor_breach"; reasoning: string }
  | { action: "stop_round_limit"; reasoning: string }
);

export function decideMove(ctx: PolicyContext): PolicyDecision {
  if (ctx.roundsUsed >= MAX_TOTAL_ROUNDS) {
    return {
      action: "stop_round_limit",
      nextNoMovementStreak: ctx.noMovementStreak,
      reasoning: `Hit the ${MAX_TOTAL_ROUNDS}-round cap without a resolution — stopping and escalating.`,
    };
  }

  if (ctx.intent === "reject") {
    return {
      action: "closed_lost",
      nextNoMovementStreak: ctx.noMovementStreak,
      reasoning: "Landlord rejected — closing as lost.",
    };
  }

  if (ctx.intent === "needs_info" || ctx.intent === "off_topic") {
    return {
      action: "answer_info",
      nextNoMovementStreak: ctx.noMovementStreak,
      reasoning: "Responding directly using listing and company context; no price move.",
    };
  }

  if (ctx.intent === "accept") {
    return {
      action: "accept",
      nextNoMovementStreak: ctx.noMovementStreak,
      finalPriceInr: ctx.currentOfferInr,
      reasoning: `Landlord accepted our offer of ₹${ctx.currentOfferInr.toLocaleString("en-IN")}.`,
    };
  }

  // intent === "counter_offer"
  // Same reasoning as openingCounterPriceInr: never let our own price move
  // above the landlord's original asking price, even when the budget-derived
  // ceiling is higher.
  const ceiling = Math.min(priceCeiling(ctx.profile), ctx.askingPriceInr);
  const floor = priceFloor(ctx.profile);

  if (ctx.offeredPriceInr == null) {
    return {
      action: "answer_info",
      nextNoMovementStreak: ctx.noMovementStreak,
      reasoning: "Counter-offer intent detected but no price could be parsed — asking for a clear number.",
    };
  }
  const offered = ctx.offeredPriceInr;

  // Suspiciously cheap: sanity-check with a firm counter instead of grabbing it.
  if (offered < floor) {
    const counterPriceInr = clamp(floor, floor, ceiling);
    return {
      action: "counter",
      nextNoMovementStreak: 0,
      counterPriceInr,
      belowFloorFlag: true,
      countsAsLadderMovement: false,
      reasoning: `₹${offered.toLocaleString("en-IN")} is below our ₹${floor.toLocaleString("en-IN")} sanity floor — countering near the floor and citing comparables rather than accepting outright.`,
    };
  }

  // Within the acceptable range.
  if (offered <= ceiling) {
    const landlordMetOrBeatOurAsk = offered <= ctx.currentOfferInr;
    const ladderExhausted = ctx.priceMovementRounds >= MAX_PRICE_MOVEMENT_ROUNDS;

    if (landlordMetOrBeatOurAsk || ladderExhausted) {
      return {
        action: "accept",
        nextNoMovementStreak: 0,
        finalPriceInr: offered,
        reasoning: landlordMetOrBeatOurAsk
          ? `₹${offered.toLocaleString("en-IN")} meets or beats our last offer of ₹${ctx.currentOfferInr.toLocaleString("en-IN")} — accepting.`
          : `Reached the ${MAX_PRICE_MOVEMENT_ROUNDS}-round movement cap within budget — accepting ₹${offered.toLocaleString("en-IN")} to close.`,
      };
    }

    const fraction = ctx.concessionFraction ?? 0.5;
    const counterPriceInr = clamp(
      Math.round(ctx.currentOfferInr + fraction * (offered - ctx.currentOfferInr)),
      floor,
      ceiling
    );
    return {
      action: "counter",
      nextNoMovementStreak: 0,
      counterPriceInr,
      belowFloorFlag: false,
      countsAsLadderMovement: true,
      usedConcessionFraction: fraction,
      reasoning: `Conceding ${Math.round(fraction * 100)}% of the gap between our ₹${ctx.currentOfferInr.toLocaleString("en-IN")} and their ₹${offered.toLocaleString("en-IN")} — countering at ₹${counterPriceInr.toLocaleString("en-IN")}.`,
    };
  }

  // Above ceiling — never accept. Check for a stuck negotiation.
  const movedDown =
    ctx.previousLandlordOfferInr != null &&
    offered <= ctx.previousLandlordOfferInr * (1 - MOVEMENT_TOLERANCE_PCT);
  const nextNoMovementStreak = movedDown ? 0 : ctx.noMovementStreak + 1;

  if (nextNoMovementStreak >= NO_MOVEMENT_STREAK_LIMIT) {
    return {
      action: "stop_floor_breach",
      nextNoMovementStreak,
      reasoning: `Landlord has held above our ₹${ceiling.toLocaleString("en-IN")} budget for ${nextNoMovementStreak} rounds with no meaningful movement — stopping.`,
    };
  }

  const counterPriceInr = clamp(
    Math.round((ctx.currentOfferInr + ceiling) / 2),
    floor,
    ceiling
  );
  return {
    action: "counter",
    nextNoMovementStreak,
    counterPriceInr,
    belowFloorFlag: false,
    countsAsLadderMovement: false,
    reasoning: `₹${offered.toLocaleString("en-IN")} is above our ₹${ceiling.toLocaleString("en-IN")} budget — holding firm with a counter at ₹${counterPriceInr.toLocaleString("en-IN")}.`,
  };
}
