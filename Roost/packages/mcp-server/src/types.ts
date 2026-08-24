export interface Listing {
  id: string;
  title: string;
  area: string;
  lat: number;
  lng: number;
  monthlyRentInr: number;
  seats: number;
  furnished: boolean;
  parking: boolean;
  cabAvailability: "high" | "medium" | "low";
  floor: number;
  description: string;
  photoUrl: string;
  landlordEmail: string;
  landlordName: string;
  contactPersona?: string;
}

export interface MetroStation {
  name: string;
  line: string;
  lat: number;
  lng: number;
}

export type MustHave = "metro" | "cab" | "parking" | "furnished";

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
