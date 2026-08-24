// One-time generator for synthetic-but-realistic Mumbai office listings +
// Mumbai Suburban Railway / Metro stations. Appends to the existing
// Bengaluru-only listings.seed.json and metroStations.seed.json instead of
// overwriting them.
// Run with: npx tsx src/data/generateMumbaiSeed.ts   (cwd = packages/mcp-server)
// Deterministic (seeded PRNG) so the output is reproducible/diffable.
//
// Rent-per-sqft ranges below were grounded via web research (Aug 2026) on
// property portals (99acres, SquareYards, NoBroker) and brokerage/news
// coverage (Business Standard, Anarock/Superluxere, Cushman & Wakefield-style
// market notes), converted to ₹/seat/month assuming ~90 sqft per seat, cross
// checked against coworking per-desk pricing (WeWork/Awfis/CoWrks/Cohub).
// See PR/report notes for the full source list. Chembur and Ghatkopar have
// thinner market data than the rest — their ranges are conservative estimates
// anchored to comparable neighboring submarkets (Vikhroli/Kurla corridor)
// rather than a strong aggregate report.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Listing, MetroStation } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Real Mumbai neighborhood centers, roughly geocoded.
// [area, lat, lng, minRentPerSeat, maxRentPerSeat, listingCount]
const AREAS: [string, number, number, number, number, number][] = [
  ["BKC", 19.0663, 72.8683, 16000, 30000, 5],
  ["Nariman Point", 18.9256, 72.8242, 16000, 21000, 4],
  ["Lower Parel", 18.9953, 72.8300, 13000, 23000, 5],
  ["Worli", 19.0100, 72.8170, 15000, 21000, 4],
  ["Andheri East", 19.1136, 72.8697, 9000, 16000, 5],
  ["Andheri West", 19.1358, 72.8296, 8500, 15500, 5],
  ["Powai", 19.1176, 72.9060, 9000, 17000, 5],
  ["Goregaon East", 19.1663, 72.8712, 8000, 16000, 5],
  ["Malad West", 19.1869, 72.8489, 6000, 12000, 5],
  ["Vikhroli", 19.1069, 72.9250, 11000, 18000, 5],
  ["Thane West", 19.1972, 72.9640, 7500, 12000, 5],
  ["Vashi", 19.0770, 73.0000, 8000, 18000, 5],
  ["Chembur", 19.0522, 72.8994, 9500, 15000, 4],
  ["Ghatkopar East", 19.0857, 72.9081, 8000, 13000, 4],
  ["Mulund West", 19.1726, 72.9425, 7000, 12500, 4],
  ["Prabhadevi", 19.0176, 72.8296, 14000, 17000, 4],
];

const LANDLORD_NAMES = [
  "Rajesh Shah", "Snehal Joshi", "Vikram Mehta", "Anita D'Souza", "Prakash Desai",
  "Neha Kulkarni", "Sameer Bhatia", "Priyanka Rane", "Aditya Save", "Farah Sheikh",
  "Rohan Kamath", "Meenal Pradhan",
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
  (area: string) => `Business-district office, ${area}`,
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
// Hardcoded (not env-overridable) so outreach can never reach a real
// uninvolved landlord during live demos, regardless of local .env contents.
const DEMO_LANDLORD_EMAIL = "sidsaachijain@gmail.com";

// mulberry32 seeded PRNG for reproducible output. Different seed from the
// Bengaluru generator so the two datasets don't share a sequence.
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

const rand = mulberry32(20260825);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) =>
  Math.floor(min + rand() * (max - min + 1));
const randFloat = (min: number, max: number) => min + rand() * (max - min);

function jitterCoord(lat: number, lng: number, radiusKm: number) {
  const angle = rand() * 2 * Math.PI;
  const dist = Math.sqrt(rand()) * radiusKm;
  const dLat = (dist / 111) * Math.cos(angle);
  const dLng = (dist / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: +(lat + dLat).toFixed(6), lng: +(lng + dLng).toFixed(6) };
}

function cabAvailabilityFor(area: string): "high" | "medium" | "low" {
  // Dense, commercially-developed hubs with heavy Uber/Ola concentration.
  const highDensity = [
    "BKC", "Lower Parel", "Nariman Point", "Worli", "Andheri East",
    "Andheri West", "Powai", "Prabhadevi",
  ];
  const roll = rand();
  if (highDensity.includes(area)) return roll < 0.7 ? "high" : roll < 0.95 ? "medium" : "low";
  const roll2 = rand();
  return roll2 < 0.35 ? "high" : roll2 < 0.8 ? "medium" : "low";
}

function generateMumbaiListings(startCounter: number): Listing[] {
  const listings: Listing[] = [];
  let counter = startCounter;

  for (const [area, lat, lng, minPerSeat, maxPerSeat, count] of AREAS) {
    for (let i = 0; i < count; i++) {
      const seats = randInt(10, 150);
      const rentPerSeat = randFloat(minPerSeat, maxPerSeat);
      const monthlyRentInr = Math.round((seats * rentPerSeat) / 500) * 500;
      const { lat: jLat, lng: jLng } = jitterCoord(lat, lng, 1.5);

      const id = `mum-${String(counter).padStart(3, "0")}`;
      const listing: Listing = {
        id,
        title: pick(TITLE_TEMPLATES)(area),
        area,
        lat: jLat,
        lng: jLng,
        monthlyRentInr,
        seats,
        furnished: rand() < 0.65,
        parking: rand() < 0.5, // parking is scarcer/pricier in Mumbai than Bengaluru
        cabAvailability: cabAvailabilityFor(area),
        floor: randInt(1, 22), // Mumbai commercial towers run taller
        description: pick(DESCRIPTION_TEMPLATES)(area, seats),
        photoUrl: `https://picsum.photos/seed/${id}/640/420`,
        landlordEmail: DEMO_LANDLORD_EMAIL,
        landlordName: pick(LANDLORD_NAMES),
        contactPersona: rand() < 0.8 ? pick(CONTACT_PERSONAS) : undefined,
      };

      listings.push(listing);
      counter++;
    }
  }

  return listings;
}

// Real Mumbai Suburban Railway (Western/Central/Harbour) + Metro station
// names and coordinates, researched Aug 2026 (Wikipedia / OSM / public
// station coordinates). Metro Line 3 (Aqua) stations reflect the phased
// 2024-2025 opening (BKC, Worli, Science Museum).
const MUMBAI_STATIONS: MetroStation[] = [
  // Western Line
  { name: "Churchgate", line: "Western Line", lat: 18.9349, lng: 72.8272 },
  { name: "Mahalaxmi", line: "Western Line", lat: 18.9825, lng: 72.8242 },
  { name: "Lower Parel", line: "Western Line", lat: 18.9953, lng: 72.8300 },
  { name: "Prabhadevi", line: "Western Line", lat: 19.0080, lng: 72.8365 },
  { name: "Dadar (Western)", line: "Western Line", lat: 19.0186, lng: 72.8430 },
  { name: "Bandra", line: "Western Line", lat: 19.0544, lng: 72.8406 },
  { name: "Andheri", line: "Western Line", lat: 19.1192, lng: 72.8469 },
  { name: "Goregaon", line: "Western Line", lat: 19.1644, lng: 72.8494 },
  { name: "Malad", line: "Western Line", lat: 19.1869, lng: 72.8489 },
  { name: "Borivali", line: "Western Line", lat: 19.2294, lng: 72.8569 },
  // Central Line
  { name: "CST", line: "Central Line", lat: 18.9398, lng: 72.8355 },
  { name: "Dadar (Central)", line: "Central Line", lat: 19.0178, lng: 72.8478 },
  { name: "Kurla", line: "Central Line", lat: 19.0656, lng: 72.8792 },
  { name: "Vikhroli", line: "Central Line", lat: 19.1100, lng: 72.9200 },
  { name: "Ghatkopar", line: "Central Line", lat: 19.0857, lng: 72.9081 },
  { name: "Mulund", line: "Central Line", lat: 19.1726, lng: 72.9560 },
  { name: "Thane", line: "Central Line", lat: 19.1861, lng: 72.9758 },
  // Harbour Line
  { name: "Chembur", line: "Harbour Line", lat: 19.0631, lng: 72.9006 },
  { name: "Vashi", line: "Harbour Line", lat: 19.0632, lng: 72.9988 },
  { name: "CBD Belapur", line: "Harbour Line", lat: 19.0186, lng: 73.0389 },
  // Metro Line 1 (Versova-Andheri-Ghatkopar)
  { name: "Andheri (Metro)", line: "Metro Line 1", lat: 19.1206, lng: 72.8481 },
  { name: "D N Nagar", line: "Metro Line 1", lat: 19.1281, lng: 72.8303 },
  { name: "Western Express Highway", line: "Metro Line 1", lat: 19.1156, lng: 72.8564 },
  { name: "Marol Naka", line: "Metro Line 1", lat: 19.1082, lng: 72.8795 },
  { name: "Saki Naka", line: "Metro Line 1", lat: 19.1035, lng: 72.8880 },
  { name: "Asalpha", line: "Metro Line 1", lat: 19.0925, lng: 72.9019 },
  { name: "Ghatkopar (Metro)", line: "Metro Line 1", lat: 19.0867, lng: 72.9080 },
  // Metro Line 3 (Aqua)
  { name: "Bandra Kurla Complex (Metro)", line: "Metro Line 3 (Aqua)", lat: 19.0606, lng: 72.8547 },
  { name: "Worli (Metro)", line: "Metro Line 3 (Aqua)", lat: 19.0086, lng: 72.8194 },
  { name: "Science Museum", line: "Metro Line 3 (Aqua)", lat: 18.9906, lng: 72.8222 },
];

function main() {
  const listingsPath = join(__dirname, "listings.seed.json");
  const stationsPath = join(__dirname, "metroStations.seed.json");

  const existingListings: Listing[] = JSON.parse(readFileSync(listingsPath, "utf-8"));
  const existingStations: MetroStation[] = JSON.parse(readFileSync(stationsPath, "utf-8"));

  const nextCounter = existingListings.length + 1;
  const mumbaiListings = generateMumbaiListings(nextCounter);

  const combinedListings = [...existingListings, ...mumbaiListings];
  const combinedStations = [...existingStations, ...MUMBAI_STATIONS];

  writeFileSync(listingsPath, JSON.stringify(combinedListings, null, 2) + "\n", "utf-8");
  writeFileSync(stationsPath, JSON.stringify(combinedStations, null, 2) + "\n", "utf-8");

  console.log(
    `Added ${mumbaiListings.length} Mumbai listings across ${AREAS.length} areas ` +
      `(total listings: ${combinedListings.length}).`
  );
  console.log(
    `Added ${MUMBAI_STATIONS.length} Mumbai stations ` +
      `(total stations: ${combinedStations.length}).`
  );
}

main();
