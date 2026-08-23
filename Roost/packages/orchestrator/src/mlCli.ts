// Smoke test / demo for the learning-based pieces — no Gmail, no API key.
// Shows: bootstrap training, live predictions on novel phrasing, the
// online-correction mechanism catching a model mistake, and the concession
// model shifting its behavior after a simulated stalled negotiation.

import { existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INTENT_MODEL_PATH = join(__dirname, "..", "data", "intentModel.json");
const CONCESSION_MODEL_PATH = join(__dirname, "..", "data", "concessionModel.json");

for (const p of [INTENT_MODEL_PATH, CONCESSION_MODEL_PATH]) {
  if (existsSync(p)) unlinkSync(p);
}

const { classifyIntent, getModelStats } = await import("./ml/intentModel.js");
const { ConcessionModel } = await import("./ml/concessionModel.js");

console.log("=== Intent model: bootstrap ===");
console.log(getModelStats());

console.log("\n=== Predictions on phrasing NOT in the training set ===");
const novelExamples: [string, number][] = [
  ["We'd be glad to move ahead with your proposed number.", 220000],
  ["Sorry, we've already signed with a different company.", 220000],
  ["How many parking spots would your team actually need?", 220000],
  ["We could manage ₹2,10,000 a month if that helps.", 220000],
  ["Just an FYI, our office is closed this Friday.", 220000],
];
for (const [text, ourOffer] of novelExamples) {
  const result = classifyIntent(text, ourOffer);
  console.log(`"${text}"`);
  console.log(
    `  -> intent=${result.intent} tone=${result.toneLabel} conf=${result.modelConfidence.toFixed(2)} corrected=${result.corrected} price=${result.offeredPriceInr}`
  );
}

console.log("\n=== Deliberately ambiguous phrasing (model may guess wrong at first) ===");
// A borderline example the bootstrap set doesn't cover well — good chance the
// young model's raw guess disagrees with the keyword oracle, triggering a
// visible correction.
const trickyText = "I suppose ₹2,05,000 could be arranged, though it's tight.";
const before = classifyIntent(trickyText, 220000);
console.log(`First pass: intent=${before.intent} tone=${before.toneLabel} corrected=${before.corrected}`);
const statsAfterOne = getModelStats();
console.log(`Model example count after that round: ${statsAfterOne.exampleCount}`);

console.log("\n=== Concession model: cold start vs after a stalled outcome ===");
const model = new ConcessionModel();
const features = { priceMovementRoundsNorm: 1 / 3, gapRatio: 0.4 };
console.log(`Cold-start prediction (should be ~0.5): ${model.predict(features).toFixed(3)}`);

// Simulate ONE stalled negotiation at this feature point, taking a few
// gradient steps toward it (matches stateMachine.ts's real update logic —
// a single SGD step barely moves a sigmoid, so a real outcome takes several
// steps to register as a visible behavior shift).
const target = Math.min(1, model.predict(features) + 0.25);
for (let i = 0; i < 5; i++) model.update(features, target, 0.4);
console.log(`After ONE simulated stall at this feature point: ${model.predict(features).toFixed(3)} (should have risen noticeably)`);

// A second stall in a similar situation should push it further still.
const target2 = Math.min(1, model.predict(features) + 0.25);
for (let i = 0; i < 5; i++) model.update(features, target2, 0.4);
console.log(`After a SECOND stall at this feature point: ${model.predict(features).toFixed(3)} (should be higher still)`);

// A different, low-movement/low-gap situation should remain closer to neutral
// since we never trained on it.
const untouchedFeatures = { priceMovementRoundsNorm: 0, gapRatio: 0.05 };
console.log(`Untouched feature point (should still be ~0.5): ${model.predict(untouchedFeatures).toFixed(3)}`);

console.log("\nAll ML smoke checks ran without error.");
