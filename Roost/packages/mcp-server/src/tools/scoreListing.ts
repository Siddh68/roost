import type { CompanyProfile, Listing, MetroStation, ScoreResult } from "../types.js";
import { scoreListings as runScoreEngine } from "../scoring/scoreEngine.js";
import { loadListings } from "./searchListings.js";
import rawStations from "../data/metroStations.seed.json" with { type: "json" };

let cachedStations: MetroStation[] | null = null;

export function loadMetroStations(): MetroStation[] {
  if (!cachedStations) {
    cachedStations = rawStations as MetroStation[];
  }
  return cachedStations;
}

export interface ScoredListing {
  listing: Listing;
  result: ScoreResult;
}

/**
 * Scores listings against a company profile. Always scores against the
 * full seed dataset (so area-median cost comparisons stay meaningful),
 * then optionally restricts the returned, ranked results to a subset of
 * listing ids (e.g. the output of searchListings).
 */
export function scoreListing(
  profile: CompanyProfile,
  listingIds?: string[]
): ScoredListing[] {
  const allListings = loadListings();
  const stations = loadMetroStations();
  const results = runScoreEngine(allListings, profile, stations);

  const idFilter = listingIds ? new Set(listingIds) : null;
  const listingById = new Map(allListings.map((l) => [l.id, l]));

  return results
    .filter((r) => !idFilter || idFilter.has(r.listingId))
    .map((result) => ({ listing: listingById.get(result.listingId)!, result }));
}
