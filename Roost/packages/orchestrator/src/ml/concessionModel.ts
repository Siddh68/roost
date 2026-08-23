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
  /** How far into the 3-round ladder we already are (0..1+). */
  priceMovementRoundsNorm: number;
  /** Remaining gap to the landlord's offer, relative to our whole acceptable range (0..1+). */
  gapRatio: number;
}

interface SerializedConcessionModel {
  weights: number[];
  bias: number;
  updateCount: number;
}

const FEATURE_COUNT = 2;

export class ConcessionModel {
  private weights: number[] = new Array(FEATURE_COUNT).fill(0);
  private bias = 0;
  private updateCount = 0;

  private toVector(f: ConcessionFeatures): number[] {
    return [f.priceMovementRoundsNorm, f.gapRatio];
  }

  predict(f: ConcessionFeatures): number {
    const x = this.toVector(f);
    let z = this.bias;
    for (let i = 0; i < x.length; i++) z += this.weights[i] * x[i];
    return 1 / (1 + Math.exp(-z));
  }

  /** One online gradient step (squared-error loss) toward `target` (0..1). */
  update(f: ConcessionFeatures, target: number, learningRate = 0.3): void {
    const x = this.toVector(f);
    const predicted = this.predict(f);
    const gradient = (predicted - target) * predicted * (1 - predicted);

    for (let i = 0; i < x.length; i++) {
      this.weights[i] -= learningRate * gradient * x[i];
    }
    this.bias -= learningRate * gradient;
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
    model.weights = [...data.weights];
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
