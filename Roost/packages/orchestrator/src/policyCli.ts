// Deterministic smoke test for the negotiation policy engine — no Claude,
// no Gmail, no DB. Walks scripted landlord price sequences through
// decideMove() and prints each decision so the ladder/guardrail logic can be
// eyeballed before it's wired into the live loop.

import {
  decideMove,
  openingCounterPriceInr,
  priceCeiling,
  priceFloor,
  type PolicyContext,
} from "./negotiation/policy.js";
import type { CompanyProfile } from "@roost/mcp-server/types";

const profile: CompanyProfile = {
  teamSize: 25,
  budgetInr: 250000,
  preferredArea: "Koramangala",
  mustHaves: ["metro", "parking", "furnished"],
  priceFloorPct: 0.85,
};

function runScenario(name: string, askingPriceInr: number, landlordOffers: number[]) {
  console.log(`\n=== Scenario: ${name} ===`);
  console.log(
    `asking=₹${askingPriceInr.toLocaleString("en-IN")} ceiling=₹${priceCeiling(profile).toLocaleString("en-IN")} floor=₹${priceFloor(profile).toLocaleString("en-IN")}`
  );

  let currentOfferInr = openingCounterPriceInr(askingPriceInr, profile);
  let previousLandlordOfferInr: number | null = null;
  let roundsUsed = 0;
  let priceMovementRounds = 0;
  let noMovementStreak = 0;

  console.log(`opening counter: ₹${currentOfferInr.toLocaleString("en-IN")}`);

  for (const offer of landlordOffers) {
    const ctx: PolicyContext = {
      intent: "counter_offer",
      offeredPriceInr: offer,
      askingPriceInr,
      currentOfferInr,
      previousLandlordOfferInr,
      profile,
      roundsUsed,
      priceMovementRounds,
      noMovementStreak,
    };
    const decision = decideMove(ctx);
    console.log(
      `  round ${roundsUsed + 1}: landlord offers ₹${offer.toLocaleString("en-IN")} -> ${decision.action}` +
        (decision.action === "counter" ? ` @ ₹${decision.counterPriceInr.toLocaleString("en-IN")}` : "") +
        (decision.action === "accept" ? ` @ ₹${decision.finalPriceInr.toLocaleString("en-IN")}` : "") +
        ` | ${decision.reasoning}`
    );

    roundsUsed++;
    previousLandlordOfferInr = offer;
    noMovementStreak = decision.nextNoMovementStreak;

    if (decision.action === "counter") {
      currentOfferInr = decision.counterPriceInr;
      if (decision.countsAsLadderMovement) priceMovementRounds++;
    }

    if (
      decision.action === "accept" ||
      decision.action === "closed_lost" ||
      decision.action === "stop_floor_breach" ||
      decision.action === "stop_round_limit"
    ) {
      console.log(`  -> thread terminal at round ${roundsUsed}: ${decision.action}`);
      return;
    }
  }
  console.log(`  -> ran out of scripted offers without a terminal state (still active)`);
}

// Landlord gradually comes down toward our range — should accept via ladder.
runScenario("landlord concedes gradually", 300000, [290000, 270000, 245000]);

// Landlord holds firm above budget the whole time — should stall and stop.
runScenario("landlord won't move", 350000, [340000, 338000, 337000]);

// Landlord opens absurdly cheap — should sanity-check with a firm counter, not grab it.
runScenario("suspiciously cheap opener", 300000, [150000, 195000]);

// Landlord meets our exact ask immediately — should accept on round 1.
runScenario("landlord caves immediately", 260000, [openingCounterPriceInr(260000, profile)]);

// Exhausts all 3 ladder movement rounds while staying in range — should force-accept.
runScenario("ladder exhaustion inside budget", 300000, [285000, 260000, 240000, 235000]);

// Never resolves within 6 rounds — should hit the round cap.
runScenario("runs past round cap", 400000, [390000, 385000, 383000, 382000, 381000, 380500]);

// In-range landlord holds firm each round (never concedes toward us) — should
// force-accept once the 3-round ladder cap is hit, distinct from the "met our ask" path.
runScenario("ladder cap forces accept (landlord never concedes)", 240000, [235000, 235000, 235000, 235000]);
