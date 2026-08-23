// The learned classifier the negotiation loop actually calls. A Naive Bayes
// model predicts the TONE of the landlord's message (agreement / decline /
// question / statement / off_topic); a small deterministic step then folds
// in the extracted price to produce the final negotiation intent — comparing
// two numbers isn't a learning problem, reading tone is.
//
// "Learns from its mistakes": every classification is checked against a
// cheap keyword oracle (ruleBasedNlu.ts). When they disagree, the oracle's
// label is treated as ground truth and the model is retrained on the spot
// (a correction). When they agree, the model is reinforced on its own
// prediction. Either way it keeps learning during live use, and its state
// persists to disk across runs.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NaiveBayesClassifier } from "./naiveBayesClassifier.js";
import { TRAINING_DATA, type ToneLabel } from "./trainingData.js";
import { extractPriceInr, heuristicToneLabel } from "../negotiation/ruleBasedNlu.js";
import type { NegotiationIntent } from "../negotiation/policy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = join(__dirname, "..", "..", "data", "intentModel.json");

let classifier: NaiveBayesClassifier | null = null;

function bootstrapTrain(): NaiveBayesClassifier {
  const model = new NaiveBayesClassifier();
  for (const ex of TRAINING_DATA) model.train(ex.text, ex.label);
  return model;
}

export function getClassifier(): NaiveBayesClassifier {
  if (!classifier) {
    classifier = NaiveBayesClassifier.load(MODEL_PATH) ?? bootstrapTrain();
    classifier.save(MODEL_PATH);
  }
  return classifier;
}

export interface ClassifiedIntent {
  intent: NegotiationIntent;
  offeredPriceInr: number | null;
  summary: string;
  toneLabel: ToneLabel;
  modelConfidence: number;
  corrected: boolean;
}

export function classifyIntent(text: string, ourLastOfferInr: number): ClassifiedIntent {
  const model = getClassifier();
  const price = extractPriceInr(text);
  const prediction = model.predict(text);
  const predictedTone = prediction.label as ToneLabel;

  const oracleTone = heuristicToneLabel(text);
  const corrected = oracleTone != null && oracleTone !== predictedTone;

  // Either correct the model against the oracle (a mistake) or reinforce
  // its own prediction (still learning, just confirming) — the model keeps
  // accumulating examples during live use either way.
  model.train(text, corrected ? oracleTone! : predictedTone);
  model.save(MODEL_PATH);

  const finalTone = corrected ? oracleTone! : predictedTone;

  let intent: NegotiationIntent;
  if (finalTone === "decline") {
    intent = "reject";
  } else if (price != null) {
    const closeToOurOffer = Math.abs(price - ourLastOfferInr) / ourLastOfferInr < 0.01;
    intent = finalTone === "agreement" || closeToOurOffer ? "accept" : "counter_offer";
  } else if (finalTone === "agreement") {
    intent = "accept";
  } else if (finalTone === "question") {
    intent = "needs_info";
  } else {
    intent = "off_topic";
  }

  const summary =
    `Model read tone as "${predictedTone}"${corrected ? ` (corrected to "${oracleTone}")` : ""}` +
    (price != null ? `, price ₹${price.toLocaleString("en-IN")}` : "") +
    ".";

  return {
    intent,
    offeredPriceInr: price,
    summary,
    toneLabel: finalTone,
    modelConfidence: prediction.scores[predictedTone] ?? 0,
    corrected,
  };
}

export function getModelStats(): { exampleCount: number; vocabSize: number } {
  const model = getClassifier();
  const json = model.toJSON();
  return { exampleCount: model.exampleCount, vocabSize: json.vocab.length };
}
