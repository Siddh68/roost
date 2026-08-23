import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Listing, MustHave } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SearchListingsQuery {
  area?: string;
  maxBudget?: number;
  minSeats?: number;
  mustHaves?: MustHave[];
}

let cachedListings: Listing[] | null = null;

export function loadListings(): Listing[] {
  if (!cachedListings) {
    const path = join(__dirname, "..", "data", "listings.seed.json");
    cachedListings = JSON.parse(readFileSync(path, "utf-8")) as Listing[];
  }
  return cachedListings;
}

export function searchListings(query: SearchListingsQuery = {}): Listing[] {
  const listings = loadListings();

  return listings.filter((listing) => {
    if (query.area && listing.area.toLowerCase() !== query.area.toLowerCase()) {
      return false;
    }
    if (query.maxBudget != null && listing.monthlyRentInr > query.maxBudget) {
      return false;
    }
    if (query.minSeats != null && listing.seats < query.minSeats) {
      return false;
    }
    if (query.mustHaves) {
      for (const need of query.mustHaves) {
        if (need === "parking" && !listing.parking) return false;
        if (need === "furnished" && !listing.furnished) return false;
        if (need === "cab" && listing.cabAvailability === "low") return false;
        // "metro" proximity is a scoring concern (needs distance calc),
        // not a hard filter here — left to scoreListing.
      }
    }
    return true;
  });
}
