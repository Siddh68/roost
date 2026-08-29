// Multinomial Naive Bayes text classifier with Laplace smoothing. No
// external ML library — plain word-count tables, which makes "training" and
// "online update" the exact same operation (just increment counts), so
// there's no real distinction between offline bootstrap training and live
// learning from new examples. State persists to disk so the model actually
// accumulates knowledge across runs instead of resetting every process.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

// A negation trigger flips the meaning of the word right after it ("not
// interested", "can't accommodate", "won't work") — a plain bag-of-words
// model sees "not" and "interested" as two separate, contradictory-looking
// signals and tends to wash them out. Tagging the following word with its
// own distinct not_-prefixed token gives the classifier a single, specific
// feature it can actually learn to associate with decline, instead of
// silently losing the negation.
const NEGATION_TRIGGERS = new Set([
  "not", "no", "never", "cant", "cannot", "wont", "dont", "doesnt", "isnt", "arent", "wasnt", "werent",
]);

export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/n't\b/g, "nt") // "won't" -> "wont", "can't" -> "cant" - lands on the same trigger set as the apostrophe-stripped forms below
    .replace(/[^a-z0-9\s₹]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const tokens: string[] = [...words];

  for (let i = 0; i < words.length - 1; i++) {
    if (NEGATION_TRIGGERS.has(words[i])) {
      // "neg:" (not "not_") deliberately can't collide with a real bigram
      // below — bigrams are always word_word with a single underscore, and
      // when the trigger word itself literally is "not", a "not_x" tag
      // would be string-identical to that pair's own natural bigram,
      // silently double-counting it every time "not" is the trigger word
      // (confirmed: "not interested" produced two identical "not_interested"
      // tokens in one document, one from each loop).
      tokens.push(`neg:${words[i + 1]}`);
    }
  }

  // Bigrams: short negotiation replies lean heavily on fixed two-word
  // phrases ("sounds good", "not feasible", "let know") where the pair
  // carries more signal than either word does alone.
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }

  return tokens;
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
