// Day-1 smoke test for the scoring engine, no server/UI involved.
// Run with: npm run score:cli --workspace=packages/mcp-server
// Optional: pass a JSON company profile path as argv[2].

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Listing, MetroStation, CompanyProfile } from "./types.js";
import { scoreListings } from "./scoring/scoreEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PROFILE: CompanyProfile = {
  teamSize: 25,
  budgetInr: 250000,
  preferredArea: "Koramangala",
  mustHaves: ["metro", "parking", "furnished"],
  priceFloorPct: 0.85,
};

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function main() {
  const listings = loadJson<Listing[]>(
    join(__dirname, "data", "listings.seed.json")
  );
  const stations = loadJson<MetroStation[]>(
    join(__dirname, "data", "metroStations.seed.json")
  );

  const profilePath = process.argv[2];
  const profile: CompanyProfile = profilePath
    ? loadJson<CompanyProfile>(profilePath)
    : DEFAULT_PROFILE;

  console.log("=== Company profile ===");
  console.log(profile);
  console.log(`\nLoaded ${listings.length} listings, ${stations.length} metro stations.\n`);

  const results = scoreListings(listings, profile, stations);
  const listingById = new Map(listings.map((l) => [l.id, l]));

  console.log("=== Top 10 shortlist ===");
  for (const [i, result] of results.slice(0, 10).entries()) {
    const listing = listingById.get(result.listingId)!;
    console.log(
      `${i + 1}. [${result.totalScore}] ${listing.title} — ${listing.area} ` +
        `(${listing.seats} seats, ₹${listing.monthlyRentInr.toLocaleString("en-IN")}/mo)`
    );
    console.log(
      `   cost=${result.breakdown.costEfficiency} commute=${result.breakdown.commute} amenity=${result.breakdown.amenityFit}`
    );
    console.log(`   ${result.reasoning}`);
  }

  console.log("\n=== Bottom 3 (sanity check the low end) ===");
  for (const result of results.slice(-3)) {
    const listing = listingById.get(result.listingId)!;
    console.log(
      `[${result.totalScore}] ${listing.title} — ${listing.area} — ${result.reasoning}`
    );
  }

  const scores = results.map((r) => r.totalScore);
  console.log(
    `\nScore range: ${Math.min(...scores)} - ${Math.max(...scores)}, ` +
      `mean: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}`
  );
}

main();
