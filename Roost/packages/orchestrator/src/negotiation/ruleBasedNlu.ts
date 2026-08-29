// Deterministic utilities used by the ML-based classifier (see
// ../ml/intentModel.ts): price extraction (a parsing task, not really
// "learnable"), and a cheap keyword-based tone oracle used only to generate
// a correction signal when the trained model disagrees with an obvious case
// — not the primary classifier itself anymore.

import type { ToneLabel } from "../ml/trainingData.js";

/**
 * Matches ₹1,50,000 / Rs. 150000 / INR 150000 / "150000/month" / "1.5 lakh
 * per month" / bare "25 lakh" / bare "25,00,000" etc.
 *
 * The last two patterns exist because real replies are often this casual —
 * "Yea 25,00,000 works for me" has no currency symbol and no "/month"
 * suffix. Confirmed live: without them, that exact message fell through to
 * null, the tone classifier read "works for me" as agreement, and the
 * agent accepted the deal at its OWN last offer instead of the landlord's
 * actual (much higher) number. Indian comma-grouping (2-digit groups after
 * the first) is itself an unambiguous rupee signal, so a bare number
 * shaped like ₹X,YY,ZZZ is trusted without needing a currency marker.
 */
export function extractPriceInr(text: string): number | null {
  const patterns = [
    /(?:₹|Rs\.?|INR|rupees)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lacs?|l)?/i,
    /([\d,]+(?:\.\d+)?)\s*(lakh|lacs?|l)?\s*(?:per\s*month|\/\s*month|pm\b|monthly|rupees)/i,
    /\b([\d,]+(?:\.\d+)?)\s*(lakh|lacs?)\b/i,
    /\b(\d{1,2}(?:,\d{2})+,\d{3})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    let num = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(num)) continue;
    if (match[2]) num *= 100000; // lakh -> absolute rupees
    if (num > 1000) return Math.round(num); // filter out unrelated small numbers (seat counts, floors, etc.)
  }
  return null;
}

// Gmail (and most mail clients) hard-wrap plain-text bodies at ~78 chars,
// so a real reply can land a "\r\n" right in the middle of a keyword phrase
// ("It's no\r\nlonger available."). A literal space between words in these
// patterns then never matches — confirmed live: an outright decline with
// "no longer available" split across a wrapped line was read as off_topic
// instead of reject. Every multi-word phrase here uses \s+ instead of a
// literal space so any run of whitespace (including a line-wrap) still
// matches.
const AGREEMENT_KEYWORDS =
  /\b(accept(ed)?|agree(d)?|sounds\s+good|deal|works\s+for\s+(us|me)|that\s+works|happy\s+to\s+proceed|let'?s\s+proceed|confirm(ed)?|go\s+ahead|we'?re\s+in)\b/i;

const DECLINE_KEYWORDS =
  /\b(not\s+interested|decline|unfortunately|can'?t\s+accommodate|cannot\s+accommodate|no\s+longer\s+available|won'?t\s+be\s+able|will\s+not\s+be\s+able|pass\s+on\s+this|reject|not\s+a\s+fit|not\s+feasible|going\s+with\s+(another|a\s+different))\b/i;

const QUESTION_KEYWORDS =
  /\?|\b(could\s+you|can\s+you|what\s+is|what\s+are|please\s+clarify|please\s+let\s+(us|me)\s+know|wondering|would\s+like\s+to\s+know)\b/i;

/**
 * A weak, cheap heuristic guess at message tone — only confident enough to
 * act as a correction signal, never as the primary classifier. Returns null
 * when nothing matches strongly (in which case the trained model's own
 * prediction is trusted as-is).
 */
export function heuristicToneLabel(text: string): ToneLabel | null {
  if (DECLINE_KEYWORDS.test(text)) return "decline";
  if (AGREEMENT_KEYWORDS.test(text)) return "agreement";
  if (QUESTION_KEYWORDS.test(text)) return "question";
  if (extractPriceInr(text) != null) return "statement";
  return null;
}
