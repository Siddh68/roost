export interface Listing {
  id: string;
  title: string;
  area: string;
  lat: number;
  lng: number;
  monthlyRentInr: number;
  seats: number;
  furnished: boolean;
  /** Replaces the old boolean `parking` flag with richer free/paid/reserved/none detail. */
  parkingType: "free" | "paid" | "reserved" | "none";
  cabAvailability: "high" | "medium" | "low";
  floor: number;
  description: string;
  photoUrl: string;
  landlordEmail: string;
  landlordName: string;
  contactPersona?: string;
  /** Count of cafes/restaurants within an easy ~300m walk of the listing. */
  nearbyCafesRestaurants: number;
  /** Walking time to the nearest metro/train station, derived from haversine
   *  distance at ~80m/min average walking speed. */
  walkingTimeToStationMinutes: number;
  coffeeMachine: boolean;
  cafeteriaOnSite: boolean;
  meetingRooms: boolean;
  access24x7: boolean;
  highSpeedInternet: boolean;
}

export interface MetroStation {
  name: string;
  line: string;
  lat: number;
  lng: number;
}

export type MustHave =
  | "metro"
  | "cab"
  | "parking"
  | "furnished"
  | "meetingRooms"
  | "access24x7"
  | "highSpeedInternet";

export interface CompanyProfile {
  teamSize: number;
  budgetInr: number;
  preferredArea: string;
  mustHaves: MustHave[];
  priceFloorPct: number;
}

export interface ScoreBreakdown {
  costEfficiency: number;
  commute: number;
  amenityFit: number;
}

export interface ScoreResult {
  listingId: string;
  totalScore: number;
  breakdown: ScoreBreakdown;
  reasoning: string;
}
