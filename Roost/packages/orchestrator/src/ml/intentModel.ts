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
import { loadAgentState, saveAgentState } from "../db/agentState.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = join(__dirname, "..", "..", "data", "intentModel.json");
const DB_KEY = "intentModel";

// "file" persists to a local JSON file — used only by mlCli.ts's smoke
// test, which deletes that file up front so each run starts from a clean
// bootstrap and never touches shared state. "db" (the live agent's default)
// persists to the AgentState table so the classifier survives restarts on
// a host with an ephemeral filesystem.
export type ModelStore = "file" | "db";

let classifier: NaiveBayesClassifier | null = null;
let classifierStore: ModelStore | null = null;

function bootstrapTrain(): NaiveBayesClassifier {
  const model = new NaiveBayesClassifier();
  for (const ex of TRAINING_DATA) model.train(ex.text, ex.label);
  return model;
}

export async function getClassifier(store: ModelStore = "db"): Promise<NaiveBayesClassifier> {
  if (classifier && classifierStore === store) return classifier;

  if (store === "file") {
    classifier = NaiveBayesClassifier.load(MODEL_PATH) ?? bootstrapTrain();
    classifier.save(MODEL_PATH);
  } else {
    try {
      const saved = await loadAgentState<ReturnType<NaiveBayesClassifier["toJSON"]>>(DB_KEY);
      classifier = saved ? NaiveBayesClassifier.fromJSON(saved) : bootstrapTrain();
    } catch (err) {
      // A bad row here must never permanently wedge every poll cycle —
      // re-bootstrapping loses accumulated corrections, but that's far
      // better than every deal in every cycle throwing forever.
      console.error("[intentModel] state load failed, re-bootstrapping:", err);
      classifier = bootstrapTrain();
    }
    await saveAgentState(DB_KEY, classifier.toJSON());
  }
  classifierStore = store;
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

export async function classifyIntent(
  text: string,
  ourLastOfferInr: number,
  store: ModelStore = "db"
): Promise<ClassifiedIntent> {
  const model = await getClassifier(store);
  const price = extractPriceInr(text);
  const prediction = model.predict(text);
  const predictedTone = prediction.label as ToneLabel;

  const oracleTone = heuristicToneLabel(text);
  const corrected = oracleTone != null && oracleTone !== predictedTone;

  // Either correct the model against the oracle (a mistake) or reinforce
  // its own prediction (still learning, just confirming) — the model keeps
  // accumulating examples during live use either way.
  model.train(text, corrected ? oracleTone! : predictedTone);
  if (store === "file") {
    model.save(MODEL_PATH);
  } else {
    await saveAgentState(DB_KEY, model.toJSON());
  }

  const finalTone = corrected ? oracleTone! : predictedTone;

  let intent: NegotiationIntent;
  if (finalTone === "decline") {
    intent = "reject";
  } else if (price != null) {
    // A price is authoritative over tone here: "At last my price would be
    // ₹X" reads as agreement-toned (settling, conclusive language) but
    // states the LANDLORD's own number, not confirmation of ours — treating
    // any agreement-toned message with a price as an accept, regardless of
    // whether that price actually matches what we offered, silently closed
    // deals at the wrong price and sent landlords a confirmation citing our
    // old offer instead of the number they'd just asked for. Only a price
    // that actually matches our last offer counts as a real acceptance;
    // anything else with a stated price is a counter, whatever the tone.
    const closeToOurOffer = Math.abs(price - ourLastOfferInr) / ourLastOfferInr < 0.01;
    intent = closeToOurOffer ? "accept" : "counter_offer";
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

export async function getModelStats(
  store: ModelStore = "db"
): Promise<{ exampleCount: number; vocabSize: number }> {
  const model = await getClassifier(store);
  const json = model.toJSON();
  return { exampleCount: model.exampleCount, vocabSize: json.vocab.length };
}
