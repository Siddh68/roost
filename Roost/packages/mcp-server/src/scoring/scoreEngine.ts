import type {
  Listing,
  MetroStation,
  CompanyProfile,
  ScoreResult,
  ScoreBreakdown,
} from "../types.js";

const WEIGHTS = {
  costEfficiency: 0.45,
  commute: 0.3,
  amenityFit: 0.25,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function nearestMetroDistanceKm(
  listing: Listing,
  stations: MetroStation[]
): number {
  let min = Infinity;
  for (const station of stations) {
    const d = haversineKm(listing.lat, listing.lng, station.lat, station.lng);
    if (d < min) min = d;
  }
  return min;
}

/** ~80m/min average walking speed — matches the seed-generation-time calc. */
export function walkingMinutesFromKm(distanceKm: number): number {
  if (!Number.isFinite(distanceKm)) return 0;
  return Math.max(1, Math.round((distanceKm * 1000) / 80));
}

/**
 * Market rate (₹/seat/month) per area, computed from raw seats — not
 * team-size-adjusted. Used as the comparison baseline for cost efficiency.
 */
export function computeAreaMedianRatePerSeat(
  listings: Listing[]
): Map<string, number> {
  const byArea = new Map<string, number[]>();
  for (const l of listings) {
    const rate = l.monthlyRentInr / l.seats;
    if (!byArea.has(l.area)) byArea.set(l.area, []);
    byArea.get(l.area)!.push(rate);
  }
  const result = new Map<string, number>();
  for (const [area, rates] of byArea) {
    result.set(area, median(rates));
  }
  return result;
}

function scoreCostEfficiency(
  listing: Listing,
  teamSize: number,
  areaMedianRate: number
): { score: number; costPerNeededSeat: number; costRatio: number } {
  const neededSeats = Math.max(listing.seats, teamSize);
  const costPerNeededSeat = listing.monthlyRentInr / neededSeats;

  // Market comparison: at ratio 1.0 (matches area median) -> 100,
  // decaying linearly to 0 at ratio 2.0 (double the market rate),
  // capped at 100 for anything cheaper than market.
  const costRatio = areaMedianRate > 0 ? costPerNeededSeat / areaMedianRate : 1;
  const marketScore = clamp(200 - costRatio * 100, 0, 100);

  // Size-fit multiplier: ideal is teamSize..teamSize+1 seats.
  // Undersized listings can't actually fit the team (harsh penalty).
  // Oversized listings mean paying for unused capacity (gentler penalty).
  const idealMax = teamSize + 1;
  let sizeFitMultiplier = 1;
  if (listing.seats < teamSize) {
    sizeFitMultiplier = clamp(listing.seats / teamSize, 0, 1);
  } else if (listing.seats > idealMax) {
    const excess = listing.seats - idealMax;
    sizeFitMultiplier = clamp(1 - (excess / teamSize) * 0.5, 0.3, 1);
  }

  const score = clamp(marketScore * sizeFitMultiplier, 0, 100);
  return { score, costPerNeededSeat, costRatio };
}

function scoreCommute(
  listing: Listing,
  stations: MetroStation[]
): { score: number; distanceKm: number; nearestStation: string | null; walkingTimeMinutes: number } {
  if (stations.length === 0) {
    return { score: 50, distanceKm: Infinity, nearestStation: null, walkingTimeMinutes: 0 };
  }

  let nearest: MetroStation = stations[0];
  let min = Infinity;
  for (const station of stations) {
    const d = haversineKm(listing.lat, listing.lng, station.lat, station.lng);
    if (d < min) {
      min = d;
      nearest = station;
    }
  }

  // Full score under 500m, tapering linearly to 0 by 3km.
  const FULL_SCORE_KM = 0.5;
  const ZERO_SCORE_KM = 3.0;
  let distanceScore: number;
  if (min <= FULL_SCORE_KM) {
    distanceScore = 100;
  } else if (min >= ZERO_SCORE_KM) {
    distanceScore = 0;
  } else {
    const t = (min - FULL_SCORE_KM) / (ZERO_SCORE_KM - FULL_SCORE_KM);
    distanceScore = 100 * (1 - t);
  }

  // Cab-availability modifier: eases the sting of a longer commute distance.
  const cabModifier =
    listing.cabAvailability === "high"
      ? 10
      : listing.cabAvailability === "medium"
      ? 0
      : -5;

  const score = clamp(distanceScore + cabModifier, 0, 100);
  return { score, distanceKm: min, nearestStation: nearest.name, walkingTimeMinutes: walkingMinutesFromKm(min) };
}

function scoreAmenityFit(
  listing: Listing,
  profile: CompanyProfile,
  nearestMetroDistanceKmValue: number,
  walkingTimeMinutes: number
): { score: number; satisfied: string[]; missing: string[]; richnessCount: number } {
  const mustHaves = profile.mustHaves ?? [];

  const satisfied: string[] = [];
  const missing: string[] = [];

  for (const need of mustHaves) {
    let met = false;
    switch (need) {
      case "metro":
        met = nearestMetroDistanceKmValue <= 1.0;
        break;
      case "cab":
        met = listing.cabAvailability === "high" || listing.cabAvailability === "medium";
        break;
      case "parking":
        met = listing.parkingType !== "none";
        break;
      case "furnished":
        met = listing.furnished;
        break;
      case "meetingRooms":
        met = listing.meetingRooms;
        break;
      case "access24x7":
        met = listing.access24x7;
        break;
      case "highSpeedInternet":
        met = listing.highSpeedInternet;
        break;
    }
    if (met) satisfied.push(need);
    else missing.push(need);
  }

  const mustHaveScore = mustHaves.length > 0 ? (satisfied.length / mustHaves.length) * 100 : 100;

  // Amenity richness: how well-equipped the space is beyond the explicit
  // must-haves — rewards furnished + free/paid/reserved parking, on-site
  // perks, and a short walk to transit; used to differentiate listings even
  // when a profile has no (or only a few) hard must-haves.
  const richnessSignals = [
    listing.furnished,
    listing.parkingType !== "none",
    listing.coffeeMachine,
    listing.cafeteriaOnSite,
    listing.meetingRooms,
    listing.access24x7,
    listing.highSpeedInternet,
  ];
  const richnessCount = richnessSignals.filter(Boolean).length;
  let richnessScore = (richnessCount / richnessSignals.length) * 100;
  if (walkingTimeMinutes <= 8) richnessScore = clamp(richnessScore + 8, 0, 100);
  else if (walkingTimeMinutes >= 20) richnessScore = clamp(richnessScore - 8, 0, 100);

  const score =
    mustHaves.length > 0
      ? clamp(mustHaveScore * 0.7 + richnessScore * 0.3, 0, 100)
      : richnessScore;

  return { score, satisfied, missing, richnessCount };
}

function buildReasoning(
  listing: Listing,
  breakdown: ScoreBreakdown,
  cost: { costPerNeededSeat: number; costRatio: number },
  commute: { distanceKm: number; nearestStation: string | null; walkingTimeMinutes: number },
  amenity: { satisfied: string[]; missing: string[] }
): string {
  const parts: string[] = [];

  const costDesc =
    cost.costRatio <= 0.95
      ? `below the ${listing.area} market rate`
      : cost.costRatio <= 1.05
      ? `roughly at the ${listing.area} market rate`
      : `above the ${listing.area} market rate`;
  parts.push(
    `₹${Math.round(cost.costPerNeededSeat).toLocaleString("en-IN")}/seat is ${costDesc}`
  );

  if (commute.nearestStation) {
    parts.push(
      `${commute.distanceKm.toFixed(1)}km (${commute.walkingTimeMinutes} min walk) from ${commute.nearestStation} metro`
    );
  }

  if (amenity.missing.length > 0) {
    parts.push(`missing: ${amenity.missing.join(", ")}`);
  } else if (amenity.satisfied.length > 0) {
    parts.push(`meets all must-haves (${amenity.satisfied.join(", ")})`);
  }

  const highlights: string[] = [];
  if (listing.parkingType !== "none") highlights.push(`${listing.parkingType} parking`);
  if (listing.meetingRooms) highlights.push("meeting rooms");
  if (listing.coffeeMachine) highlights.push("coffee machine");
  if (listing.cafeteriaOnSite) highlights.push("on-site cafeteria");
  if (listing.access24x7) highlights.push("24/7 access");
  if (listing.highSpeedInternet) highlights.push("high-speed internet");
  if (highlights.length > 0) {
    parts.push(`amenities: ${highlights.slice(0, 3).join(", ")}`);
  }

  if (listing.nearbyCafesRestaurants > 0) {
    parts.push(`${listing.nearbyCafesRestaurants} cafes/restaurants nearby`);
  }

  return parts.join("; ") + ".";
}

export function scoreListing(
  listing: Listing,
  profile: CompanyProfile,
  stations: MetroStation[],
  areaMedianRates: Map<string, number>
): ScoreResult {
  const areaMedianRate =
    areaMedianRates.get(listing.area) ?? listing.monthlyRentInr / listing.seats;

  const cost = scoreCostEfficiency(listing, profile.teamSize, areaMedianRate);
  const commute = scoreCommute(listing, stations);
  const amenity = scoreAmenityFit(listing, profile, commute.distanceKm, commute.walkingTimeMinutes);

  const breakdown: ScoreBreakdown = {
    costEfficiency: Math.round(cost.score * 10) / 10,
    commute: Math.round(commute.score * 10) / 10,
    amenityFit: Math.round(amenity.score * 10) / 10,
  };

  const totalScore = Math.round(
    breakdown.costEfficiency * WEIGHTS.costEfficiency +
      breakdown.commute * WEIGHTS.commute +
      breakdown.amenityFit * WEIGHTS.amenityFit
  );

  const reasoning = buildReasoning(listing, breakdown, cost, commute, amenity);

  return {
    listingId: listing.id,
    totalScore,
    breakdown,
    reasoning,
  };
}

export function scoreListings(
  listings: Listing[],
  profile: CompanyProfile,
  stations: MetroStation[]
): ScoreResult[] {
  const areaMedianRates = computeAreaMedianRatePerSeat(listings);
  return listings
    .map((listing) => scoreListing(listing, profile, stations, areaMedianRates))
    .sort((a, b) => b.totalScore - a.totalScore);
}
