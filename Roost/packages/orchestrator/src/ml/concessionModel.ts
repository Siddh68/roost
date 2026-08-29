// Online-learned model for "how much of the gap to concede" when countering
// an in-range landlord offer (the split-the-difference ladder step in
// policy.ts). A single-layer logistic-squashed linear model: cold-starts at
// bias=0 (sigmoid(0)=0.5), matching the original fixed 50/50 split as a
// neutral prior, then adapts via simple online gradient updates keyed off
// real outcomes (see recordOutcome in stateMachine.ts):
//   - a thread that stalls (hits the round cap or the no-movement stop)
//     nudges the weights toward conceding MORE next time in similar
//     situations — the model "learns from its mistake" of being too
//     conservative.
//   - a thread that closes (accepted) gives a small reinforcing update
//     toward the fraction that was actually used.
//
// The hard price ceiling/floor guardrails in policy.ts are never touched by
// this model — its output is always clamped there regardless of what it
// predicts.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

export interface ConcessionFeatures {
  /** How far into the 3-round price-movement ladder we already are (0..1+). */
  priceMovementRoundsNorm: number;
  /** Remaining gap to the landlord's offer, relative to our whole acceptable range (0..1+). */
  gapRatio: number;
  /** How far into the 6-round total cap this thread is (0..1+) — a thread can be deep into
   * total rounds via off-topic/needs-info exchanges even with few real price moves, which
   * priceMovementRoundsNorm alone can't see. */
  roundsUsedNorm: number;
  /** How many consecutive rounds the landlord has held above budget with no real movement
   * (0..1+, normalized by the stall limit) — lets the model learn its own answer to "does
   * conceding faster actually break a stall, or just get read as weakness," from real
   * outcomes, instead of that judgment call being baked in as a fixed rule. */
  noMovementStreakNorm: number;
}

interface SerializedConcessionModel {
  weights: number[];
  bias: number;
  updateCount: number;
}

const FEATURE_COUNT = 4;
// Online SGD with a fixed learning rate oscillates once a model has seen
// enough updates to be roughly-calibrated — the very last outcome can swing
// the weights by as much as the very first one did. Decaying the effective
// rate as updateCount grows lets it move fast while it's still ignorant and
// settle down (rather than jitter) as it accumulates real evidence. A small
// L2 pull-to-zero keeps a long run of updates from drifting the weights to
// extreme, poorly-generalizing values on the strength of a few streaks.
const BASE_LEARNING_RATE = 0.3;
const LEARNING_RATE_DECAY = 50; // updates to roughly halve the effective rate
const L2_REGULARIZATION = 0.001;

export class ConcessionModel {
  private weights: number[] = new Array(FEATURE_COUNT).fill(0);
  private bias = 0;
  private updateCount = 0;

  private toVector(f: ConcessionFeatures): number[] {
    // Threads negotiated before roundsUsedNorm/noMovementStreakNorm existed
    // have their lastConcessionFeaturesJson persisted with only the first
    // two fields — parsed back at outcome time and fed straight in here.
    // Defaulting the missing ones to 0 (rather than trusting the caller)
    // stops that from ever injecting `undefined` into the dot product,
    // which would produce a NaN weight update that permanently corrupts
    // every future prediction from that point on.
    return [f.priceMovementRoundsNorm, f.gapRatio, f.roundsUsedNorm ?? 0, f.noMovementStreakNorm ?? 0];
  }

  predict(f: ConcessionFeatures): number {
    const x = this.toVector(f);
    let z = this.bias;
    for (let i = 0; i < x.length; i++) z += this.weights[i] * x[i];
    return 1 / (1 + Math.exp(-z));
  }

  /** One online gradient step (squared-error loss, L2-regularized, decayed learning rate) toward `target` (0..1). */
  update(f: ConcessionFeatures, target: number, learningRate = BASE_LEARNING_RATE): void {
    const x = this.toVector(f);
    const predicted = this.predict(f);
    const gradient = (predicted - target) * predicted * (1 - predicted);
    const effectiveRate = learningRate / (1 + this.updateCount / LEARNING_RATE_DECAY);

    for (let i = 0; i < x.length; i++) {
      this.weights[i] -= effectiveRate * (gradient * x[i] + L2_REGULARIZATION * this.weights[i]);
    }
    this.bias -= effectiveRate * gradient;
    this.updateCount++;
  }

  get totalUpdates(): number {
    return this.updateCount;
  }

  toJSON(): SerializedConcessionModel {
    return { weights: [...this.weights], bias: this.bias, updateCount: this.updateCount };
  }

  static fromJSON(data: SerializedConcessionModel): ConcessionModel {
    const model = new ConcessionModel();
    // A model saved before roundsUsedNorm/noMovementStreakNorm existed has
    // only 2 weights - pad with zeros (a brand-new feature starts with no
    // learned influence either way) rather than losing everything it
    // already learned about the first two features.
    model.weights = new Array(FEATURE_COUNT).fill(0);
    for (let i = 0; i < Math.min(data.weights.length, FEATURE_COUNT); i++) {
      model.weights[i] = data.weights[i];
    }
    model.bias = data.bias;
    model.updateCount = data.updateCount;
    return model;
  }

  static load(path: string): ConcessionModel | null {
    if (!existsSync(path)) return null;
    return ConcessionModel.fromJSON(JSON.parse(readFileSync(path, "utf-8")));
  }

  save(path: string): void {
    writeFileSync(path, JSON.stringify(this.toJSON(), null, 2), "utf-8");
  }
}
