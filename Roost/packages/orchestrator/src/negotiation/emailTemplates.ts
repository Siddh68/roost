// Parameterized email templates — no LLM. Each function fills variable
// slots (price, listing details, company context) into a small set of
// hand-written phrasing variants, picked pseudo-randomly for a bit of
// variety across threads.

import type { CompanyProfile, Listing } from "@roost/mcp-server/types";
import { loadListings } from "@roost/mcp-server/tools/searchListings";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function outreachEmail(listing: Listing, profile: CompanyProfile, openingOfferInr: number): string {
  const greeting = pick([`Hi ${listing.landlordName},`, `Hello ${listing.landlordName},`]);
  const amenities = [
    listing.furnished ? "furnished" : null,
    listing.parking ? "parking available" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `${greeting}

We're a company of ${profile.teamSize} people looking for office space in ${listing.area}, and your listing "${listing.title}" caught our eye — ${listing.seats} seats${amenities ? `, ${amenities}` : ""}.

We'd be looking to move quickly at ${inr(openingOfferInr)}/month against the listed ${inr(listing.monthlyRentInr)} — let us know if that works on your end, or where you'd land.

Best,
The Roost team`;
}

export function acceptEmail(listing: Listing, finalPriceInr: number): string {
  const opener = pick([
    "That works for us — happy to confirm at that rate.",
    "Sounds great, let's lock that in.",
  ]);
  return `Hi ${listing.landlordName},

${opener} We'd like to move forward with "${listing.title}" at ${inr(finalPriceInr)}/month.

What are the next steps to finalize the lease on our end?

Best,
The Roost team`;
}

export function counterEmail(args: {
  listing: Listing;
  counterPriceInr: number;
  belowFloorFlag: boolean;
}): string {
  const { listing, counterPriceInr, belowFloorFlag } = args;

  if (belowFloorFlag) {
    const comparables = loadListings()
      .filter((l) => l.area === listing.area && l.id !== listing.id)
      .slice(0, 2);
    const comparableLine =
      comparables.length > 0
        ? ` For context, other spaces we're looking at in ${listing.area} are priced around ${comparables
            .map((c) => inr(c.monthlyRentInr))
            .join(" and ")}, so we want to make sure we're comparing apples to apples before confirming.`
        : "";
    return `Hi ${listing.landlordName},

Thanks for the number — it's quite a bit below what we've been seeing for similar spaces, so before we confirm we'd like to double check the details are accurate.${comparableLine}

Could we settle on ${inr(counterPriceInr)}/month, and could you confirm the listing details (seats, furnishing, availability) are current?

Best,
The Roost team`;
  }

  return `Hi ${listing.landlordName},

Thanks for getting back to us. We'd like to propose ${inr(counterPriceInr)}/month for "${listing.title}" — let us know if that works on your end.

Best,
The Roost team`;
}

export function answerInfoEmail(listing: Listing, profile: CompanyProfile): string {
  const amenities = [
    listing.furnished ? "the space is furnished" : "the space is unfurnished",
    listing.parking ? "parking is available" : "no dedicated parking",
    `it's on floor ${listing.floor}`,
  ].join("; ");

  return `Hi ${listing.landlordName},

Happy to share more details: we're a team of ${profile.teamSize}, and for "${listing.title}" — ${amenities}. We're working within a monthly budget and would love to hear if there's flexibility on rent or terms.

Let us know if you need anything else from our side to move forward.

Best,
The Roost team`;
}

/** Immediate auto-reply to a client's intake email once we've parsed their requirements, scored listings, and kicked off landlord outreach. */
export function clientShortlistEmail(args: {
  profile: CompanyProfile;
  shortlist: { listing: Listing; totalScore: number; reasoning: string }[];
}): string {
  const { profile, shortlist } = args;
  const lines = shortlist
    .map(
      (s, i) =>
        `${i + 1}. ${s.listing.title} — ${s.listing.area}, ${inr(s.listing.monthlyRentInr)}/mo (fit score ${s.totalScore}/100)\n   ${s.reasoning}`
    )
    .join("\n\n");

  return `Hi,

Thanks for the details — here's what we found for a team of ${profile.teamSize} in ${profile.preferredArea}, budget ${inr(profile.budgetInr)}/month:

${lines}

We've already reached out to the landlords for these to check availability and start negotiating on your behalf — we'll follow up with next steps as soon as we hear back.

Best,
The Roost team`;
}

/** Sent to the client the moment a landlord accepts terms on one of their shortlisted listings. */
export function clientDealWonEmail(args: {
  listing: Listing;
  finalPriceInr: number;
  savingsInr: number;
}): string {
  const { listing, finalPriceInr, savingsInr } = args;
  const savingsLine =
    savingsInr > 0
      ? ` — ${inr(savingsInr)}/month below the original asking price`
      : "";
  return `Hi,

Good news — we've locked in terms with the landlord for "${listing.title}" in ${listing.area}.

Final rate: ${inr(finalPriceInr)}/month${savingsLine}.

We'll follow up with next steps to finalize the lease. Let us know if you'd like us to keep negotiating on any of the other shortlisted options in parallel, or pause those threads.

Best,
The Roost team`;
}

/** Sent to the client if every shortlisted landlord thread closes without a deal (rejected/escalated). */
export function clientDealLostEmail(): string {
  return `Hi,

An update on your office search — we weren't able to land a deal within your budget on any of the shortlisted listings this round (the landlords either declined or we hit a round limit without meaningful movement).

We can widen the search — a larger budget range, a different area, or relaxed must-haves — and try again. Let us know how you'd like to proceed.

Best,
The Roost team`;
}

/** Sent for any follow-up message a client sends after their intake is already processed and outreach is underway — keeps every reply answered without re-running intake or duplicating outreach. */
export function clientFollowUpAckEmail(): string {
  return `Hi,

Thanks for the note — we've already kicked off outreach to the landlords on your shortlist and are tracking replies. We'll update you the moment there's movement (an acceptance, a counter, or if we need a decision from you).

Best,
The Roost team`;
}

export function closedLostEmail(listing: Listing): string {
  return `Hi ${listing.landlordName},

Thanks so much for the conversation — after weighing our options, we won't be moving forward with "${listing.title}" this time. We appreciate the time you took to work with us.

Best,
The Roost team`;
}
