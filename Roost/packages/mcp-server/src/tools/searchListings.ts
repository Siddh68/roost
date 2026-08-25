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

// The current live demo is Mumbai-only — Bengaluru listings (id prefix
// "blr-") stay in the seed data but are excluded from search/scoring/area
// matching everywhere, so a client can never get a mixed-city shortlist or
// have their profile default to a Bengaluru neighborhood. Drop this filter
// (or make it a query param) once the product covers multiple cities live.
const ACTIVE_LISTING_ID_PREFIX = "mum-";

export function loadListings(): Listing[] {
  if (!cachedListings) {
    const path = join(__dirname, "..", "data", "listings.seed.json");
    const all = JSON.parse(readFileSync(path, "utf-8")) as Listing[];
    cachedListings = all.filter((l) => l.id.startsWith(ACTIVE_LISTING_ID_PREFIX));
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
        if (need === "parking" && listing.parkingType === "none") return false;
        if (need === "furnished" && !listing.furnished) return false;
        if (need === "cab" && listing.cabAvailability === "low") return false;
        if (need === "meetingRooms" && !listing.meetingRooms) return false;
        if (need === "access24x7" && !listing.access24x7) return false;
        if (need === "highSpeedInternet" && !listing.highSpeedInternet) return false;
        // "metro" proximity is a scoring concern (needs distance calc),
        // not a hard filter here — left to scoreListing.
      }
    }
    return true;
  });
}
