// Rule-based extraction of a CompanyProfile from a client's free-text intake
// email — no LLM, matching the rest of the project's NLU (ruleBasedNlu.ts
// does the same job for landlord price replies). Deliberately conservative:
// regex/keyword matching over a handful of expected phrasings, not general
// NLU — this only needs to handle "tell us your team size/budget/area/
// must-haves" replies, the one question our own outreach email asks.

import type { CompanyProfile, MustHave } from "@roost/mcp-server/types";
import { loadListings } from "@roost/mcp-server/tools/searchListings";

const DEFAULT_MUST_HAVES: MustHave[] = [];
const DEFAULT_PRICE_FLOOR_PCT = 0.85;

function extractTeamSize(text: string): number | null {
  // "5-10 members", "5 to 10 people", "team of 8", "8 seats", "Team size: 12"
  const range = text.match(/(\d{1,4})\s*(?:-|to)\s*(\d{1,4})\s*(?:members|people|seats|person|employees)/i);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return Math.round((lo + hi) / 2);
  }
  const single = text.match(
    /(?:team size|team of|company of|headcount|seats?(?: needed)?)\s*[:\-]?\s*(\d{1,4})/i
  );
  if (single) return Number(single[1]);
  const fallback = text.match(/(\d{1,4})\s*(?:members|people|employees|person|of us|seats?)/i);
  if (fallback) return Number(fallback[1]);
  return null;
}

function extractBudget(text: string): number | null {
  // "₹25,000", "Rs 25000", "25,000/month", "budget of 2,50,000"
  const match = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lakhs|l|k)?/i);
  if (match) {
    let n = Number(match[1].replace(/,/g, ""));
    const unit = match[2]?.toLowerCase();
    if (unit === "lakh" || unit === "lakhs" || unit === "l") n *= 100000;
    if (unit === "k") n *= 1000;
    return Math.round(n);
  }
  const bare = text.match(/budget[^\d₹]{0,15}([\d,]{4,})/i);
  if (bare) return Math.round(Number(bare[1].replace(/,/g, "")));
  return null;
}

// Per-city fallback when the client names the city but not a specific
// neighborhood ("Anywhere in Mumbai") — picking a specific area from the
// WRONG city (e.g. defaulting to Bengaluru's Koramangala for a Mumbai
// client) is worse than a same-city guess, even an arbitrary one.
const CITY_KEYWORDS: { pattern: RegExp; defaultArea: string }[] = [
  { pattern: /\bmumbai\b|\bbombay\b/i, defaultArea: "Lower Parel" },
  { pattern: /\bbengaluru\b|\bbangalore\b/i, defaultArea: "Koramangala" },
];

function extractArea(text: string): string | null {
  const areas = [...new Set(loadListings().map((l) => l.area))];
  const lower = text.toLowerCase();
  for (const area of areas) {
    if (lower.includes(area.toLowerCase())) return area;
  }
  for (const { pattern, defaultArea } of CITY_KEYWORDS) {
    if (pattern.test(text)) return defaultArea;
  }
  return null;
}

function extractMustHaves(text: string): MustHave[] {
  const lower = text.toLowerCase();
  const found: MustHave[] = [];
  if (/metro|station|walk(?:able|ing) distance/.test(lower)) found.push("metro");
  if (/\bparking\b/.test(lower)) found.push("parking");
  if (/furnish/.test(lower)) found.push("furnished");
  if (/\bcab\b|cab availability|pickup/.test(lower)) found.push("cab");
  return found.length > 0 ? found : DEFAULT_MUST_HAVES;
}

export interface ParsedIntake {
  profile: CompanyProfile | null;
  missingFields: string[];
}

/**
 * Extracts a CompanyProfile from a client's reply to our intake question.
 * Returns null profile + the list of fields we couldn't find if team size
 * or budget (the two required numeric fields) are missing — the caller
 * should ask a follow-up rather than guess at money/headcount.
 */
export function parseClientIntake(body: string, fallbackArea: string): ParsedIntake {
  const teamSize = extractTeamSize(body);
  const budgetInr = extractBudget(body);
  const preferredArea = extractArea(body) ?? fallbackArea;
  const mustHaves = extractMustHaves(body);

  const missingFields: string[] = [];
  if (teamSize == null) missingFields.push("team size");
  if (budgetInr == null) missingFields.push("monthly budget");

  if (teamSize == null || budgetInr == null) {
    return { profile: null, missingFields };
  }

  return {
    profile: {
      teamSize,
      budgetInr,
      preferredArea,
      mustHaves,
      priceFloorPct: DEFAULT_PRICE_FLOOR_PCT,
    },
    missingFields: [],
  };
}
