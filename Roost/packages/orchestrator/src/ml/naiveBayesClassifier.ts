// Multinomial Naive Bayes text classifier with Laplace smoothing. No
// external ML library — plain word-count tables, which makes "training" and
// "online update" the exact same operation (just increment counts), so
// there's no real distinction between offline bootstrap training and live
// learning from new examples. State persists to disk so the model actually
// accumulates knowledge across runs instead of resetting every process.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s₹]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

interface SerializedModel {
  classCounts: Record<string, number>;
  wordCounts: Record<string, Record<string, number>>;
  wordTotals: Record<string, number>;
  vocab: string[];
  totalDocs: number;
}

export interface Prediction {
  label: string;
  scores: Record<string, number>; // normalized posterior probabilities
}

export class NaiveBayesClassifier {
  private classCounts = new Map<string, number>();
  private wordCounts = new Map<string, Map<string, number>>(); // label -> word -> count
  private wordTotals = new Map<string, number>(); // label -> total word count
  private vocab = new Set<string>();
  private totalDocs = 0;

  train(text: string, label: string): void {
    const tokens = tokenize(text);
    this.classCounts.set(label, (this.classCounts.get(label) ?? 0) + 1);
    this.totalDocs++;

    if (!this.wordCounts.has(label)) this.wordCounts.set(label, new Map());
    const counts = this.wordCounts.get(label)!;

    for (const token of tokens) {
      this.vocab.add(token);
      counts.set(token, (counts.get(token) ?? 0) + 1);
      this.wordTotals.set(label, (this.wordTotals.get(label) ?? 0) + 1);
    }
  }

  predict(text: string): Prediction {
    const tokens = tokenize(text);
    const labels = [...this.classCounts.keys()];
    if (labels.length === 0) {
      throw new Error("Classifier has no training data yet");
    }

    const vocabSize = Math.max(this.vocab.size, 1);
    const logScores = new Map<string, number>();

    for (const label of labels) {
      const classPrior = this.classCounts.get(label)! / this.totalDocs;
      let logScore = Math.log(classPrior);

      const counts = this.wordCounts.get(label) ?? new Map();
      const totalWordsInClass = this.wordTotals.get(label) ?? 0;

      for (const token of tokens) {
        const wordCount = counts.get(token) ?? 0;
        // Laplace (add-one) smoothing over the vocabulary.
        const p = (wordCount + 1) / (totalWordsInClass + vocabSize);
        logScore += Math.log(p);
      }

      logScores.set(label, logScore);
    }

    // Convert log-scores to a normalized probability distribution (softmax
    // over the log-scores, numerically stabilized by subtracting the max).
    const maxLog = Math.max(...logScores.values());
    let sumExp = 0;
    const expScores = new Map<string, number>();
    for (const [label, logScore] of logScores) {
      const e = Math.exp(logScore - maxLog);
      expScores.set(label, e);
      sumExp += e;
    }

    const scores: Record<string, number> = {};
    let bestLabel = labels[0];
    let bestScore = -Infinity;
    for (const [label, e] of expScores) {
      const p = e / sumExp;
      scores[label] = p;
      if (p > bestScore) {
        bestScore = p;
        bestLabel = label;
      }
    }

    return { label: bestLabel, scores };
  }

  get exampleCount(): number {
    return this.totalDocs;
  }

  toJSON(): SerializedModel {
    const wordCounts: Record<string, Record<string, number>> = {};
    for (const [label, counts] of this.wordCounts) {
      wordCounts[label] = Object.fromEntries(counts);
    }
    return {
      classCounts: Object.fromEntries(this.classCounts),
      wordCounts,
      wordTotals: Object.fromEntries(this.wordTotals),
      vocab: [...this.vocab],
      totalDocs: this.totalDocs,
    };
  }

  static fromJSON(data: SerializedModel): NaiveBayesClassifier {
    const model = new NaiveBayesClassifier();
    model.classCounts = new Map(Object.entries(data.classCounts));
    model.wordTotals = new Map(Object.entries(data.wordTotals));
    model.vocab = new Set(data.vocab);
    model.totalDocs = data.totalDocs;
    for (const [label, counts] of Object.entries(data.wordCounts)) {
      model.wordCounts.set(label, new Map(Object.entries(counts)));
    }
    return model;
  }

  static load(path: string): NaiveBayesClassifier | null {
    if (!existsSync(path)) return null;
    return NaiveBayesClassifier.fromJSON(JSON.parse(readFileSync(path, "utf-8")));
  }

  save(path: string): void {
    writeFileSync(path, JSON.stringify(this.toJSON(), null, 2), "utf-8");
  }
}
