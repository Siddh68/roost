// One-time generator for synthetic-but-realistic Bengaluru office listings.
// Run with: npm run gen:seed --workspace=packages/mcp-server
// Deterministic (seeded PRNG) so the output is reproducible/diffable.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import type { Listing, MetroStation } from "../types.js";
import { haversineKm, walkingMinutesFromKm } from "../scoring/scoreEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// npm workspaces run this with cwd = packages/mcp-server, so the bare
// "dotenv/config" import would look for .env there instead of the repo root.
config({ path: join(__dirname, "..", "..", "..", "..", ".env") });

// Real Bengaluru neighborhood centers, roughly geocoded.
// [area, lat, lng, minRentPerSeat, maxRentPerSeat]
const AREAS: [string, number, number, number, number][] = [
  ["Koramangala", 12.9352, 77.6245, 9000, 13500],
  ["Indiranagar", 12.9719, 77.6412, 9500, 14000],
  ["HSR Layout", 12.9121, 77.6446, 7500, 11000],
  ["Whitefield", 12.9698, 77.7500, 6000, 9500],
  ["MG Road", 12.9757, 77.6070, 10000, 15000],
  ["Electronic City", 12.8452, 77.6602, 4500, 7000],
  ["Jayanagar", 12.9308, 77.5838, 6000, 9000],
  ["JP Nagar", 12.9077, 77.5851, 5500, 8500],
  ["Marathahalli", 12.9569, 77.7011, 6000, 9000],
  ["Bellandur", 12.9257, 77.6761, 6500, 9500],
  ["Sarjapur Road", 12.9010, 77.6874, 5500, 8500],
  ["BTM Layout", 12.9166, 77.6101, 6000, 8800],
  ["Malleshwaram", 13.0035, 77.5709, 6500, 9500],
  ["Rajajinagar", 12.9911, 77.5529, 6000, 9000],
  ["Yelahanka", 13.1005, 77.5963, 4500, 6800],
  ["Hebbal", 13.0358, 77.5970, 6000, 9000],
  ["Domlur", 12.9611, 77.6387, 8500, 12000],
  ["CV Raman Nagar", 12.9829, 77.6653, 7000, 10000],
  ["Banashankari", 12.9251, 77.5460, 4800, 7200],
  ["Vijayanagar", 12.9719, 77.5344, 5000, 7500],
];

const LISTINGS_PER_AREA = 4;

const LANDLORD_NAMES = [
  "Anand Rao", "Priya Nair", "Suresh Kumar", "Deepa Menon", "Ravi Shetty",
  "Kavita Iyer", "Manoj Pillai", "Lakshmi Narayan", "Arjun Reddy", "Sneha Gupta",
];

const CONTACT_PERSONAS = [
  "responsive, prefers email over calls",
  "negotiates hard, expects a counter before agreeing",
  "flexible on price if lease term is 24+ months",
  "quick to respond, values long-term stable tenants",
  "cautious, asks for company details before discussing price",
];

const TITLE_TEMPLATES = [
  (area: string) => `Managed office space in ${area}`,
  (area: string) => `Fully-equipped coworking floor, ${area}`,
  (area: string) => `Grade-A office suite, ${area}`,
  (area: string) => `Boutique office space near ${area} main road`,
  (area: string) => `Tech-park adjacent office, ${area}`,
];

const DESCRIPTION_TEMPLATES = [
  (area: string, seats: number) =>
    `Bright, open-plan floor in the heart of ${area}, fitted out for a team of around ${seats}. Close to cafes and everyday conveniences.`,
  (area: string, seats: number) =>
    `A well-maintained office in ${area} with room for roughly ${seats} desks. Quiet building, easy access for staff and visitors.`,
  (area: string, seats: number) =>
    `Modern workspace in ${area}, sized for about ${seats} people. Flexible layout — easy to reconfigure as the team grows.`,
  (area: string, seats: number) =>
    `Centrally located in ${area}, this floor comfortably seats around ${seats}. Popular with growing teams in the area.`,
  (area: string, seats: number) =>
    `A practical, no-frills office in ${area} built for roughly ${seats} people, with straightforward lease terms.`,
];

// Demo landlord inbox — all listings route here for the single test account.
// Overridable so the generator can be re-run once GMAIL_LANDLORD_EMAIL is set.
const DEMO_LANDLORD_EMAIL =
  process.env.GMAIL_LANDLORD_EMAIL || "landlord.demo@roost-hackathon.test";

// mulberry32 seeded PRNG for reproducible output.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260823);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) =>
  Math.floor(min + rand() * (max - min + 1));
const randFloat = (min: number, max: number) => min + rand() * (max - min);

function jitterCoord(lat: number, lng: number, radiusKm: number) {
  // Small random offset within ~radiusKm of the area center, roughly uniform.
  const angle = rand() * 2 * Math.PI;
  const dist = Math.sqrt(rand()) * radiusKm;
  const dLat = (dist / 111) * Math.cos(angle);
  const dLng = (dist / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: +(lat + dLat).toFixed(6), lng: +(lng + dLng).toFixed(6) };
}

// Denser/tech-corridor areas — reused as a proxy for both cab availability
// and how many cafes/restaurants tend to cluster nearby.
const HIGH_FOOTFALL_AREAS = ["Koramangala", "Indiranagar", "MG Road", "HSR Layout", "Whitefield", "Domlur", "Bellandur"];

function cabAvailabilityFor(area: string): "high" | "medium" | "low" {
  const roll = rand();
  if (HIGH_FOOTFALL_AREAS.includes(area)) return roll < 0.7 ? "high" : roll < 0.95 ? "medium" : "low";
  const roll2 = rand();
  return roll2 < 0.35 ? "high" : roll2 < 0.8 ? "medium" : "low";
}

function nearbyCafesRestaurantsFor(area: string): number {
  return HIGH_FOOTFALL_AREAS.includes(area) ? randInt(8, 25) : randInt(2, 12);
}

function parkingTypeFor(): "free" | "paid" | "reserved" | "none" {
  if (rand() < 0.45) return "none"; // ~55% have some form of parking, matching prior boolean rate
  const roll = rand();
  if (roll < 0.4) return "free";
  if (roll < 0.8) return "paid";
  return "reserved";
}

function nearestStationWalkingMinutes(lat: number, lng: number, stations: MetroStation[]): number {
  if (stations.length === 0) return 0;
  let min = Infinity;
  for (const station of stations) {
    const d = haversineKm(lat, lng, station.lat, station.lng);
    if (d < min) min = d;
  }
  return walkingMinutesFromKm(min);
}

function loadExistingStations(): MetroStation[] {
  try {
    const raw = readFileSync(join(__dirname, "metroStations.seed.json"), "utf-8");
    return JSON.parse(raw) as MetroStation[];
  } catch {
    return [];
  }
}

function generateListings(stations: MetroStation[]): Listing[] {
  const listings: Listing[] = [];
  let counter = 1;

  for (const [area, lat, lng, minPerSeat, maxPerSeat] of AREAS) {
    for (let i = 0; i < LISTINGS_PER_AREA; i++) {
      const seats = randInt(10, 150);
      const rentPerSeat = randFloat(minPerSeat, maxPerSeat);
      const monthlyRentInr = Math.round((seats * rentPerSeat) / 500) * 500; // round to nearest 500
      const { lat: jLat, lng: jLng } = jitterCoord(lat, lng, 1.5);

      const listing: Listing = {
        id: `blr-${String(counter).padStart(3, "0")}`,
        title: pick(TITLE_TEMPLATES)(area),
        area,
        lat: jLat,
        lng: jLng,
        monthlyRentInr,
        seats,
        furnished: rand() < 0.65,
        parkingType: parkingTypeFor(),
        cabAvailability: cabAvailabilityFor(area),
        floor: randInt(1, 15),
        description: pick(DESCRIPTION_TEMPLATES)(area, seats),
        photoUrl: `https://picsum.photos/seed/blr-${String(counter).padStart(3, "0")}/640/420`,
        landlordEmail: DEMO_LANDLORD_EMAIL,
        landlordName: pick(LANDLORD_NAMES),
        contactPersona: rand() < 0.8 ? pick(CONTACT_PERSONAS) : undefined,
        nearbyCafesRestaurants: nearbyCafesRestaurantsFor(area),
        walkingTimeToStationMinutes: nearestStationWalkingMinutes(jLat, jLng, stations),
        coffeeMachine: rand() < 0.5,
        cafeteriaOnSite: rand() < 0.25,
        meetingRooms: rand() < 0.7,
        access24x7: rand() < 0.35,
        highSpeedInternet: rand() < 0.85,
      };

      listings.push(listing);
      counter++;
    }
  }

  return listings;
}

function main() {
  const stations = loadExistingStations();
  const listings = generateListings(stations);
  const outPath = join(__dirname, "listings.seed.json");
  writeFileSync(outPath, JSON.stringify(listings, null, 2) + "\n", "utf-8");
  console.log(`Generated ${listings.length} listings across ${AREAS.length} areas -> ${outPath}`);
}

main();
