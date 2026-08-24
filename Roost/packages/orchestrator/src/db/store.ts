// Domain data layer for deals, saved searches, negotiations, and the
// transcript/activity log — backed by Prisma (see prisma/schema.prisma).
//
// Deliberately keeps the same function names/shapes the negotiation state
// machine already relies on (see negotiation/stateMachine.ts) — e.g.
// NegotiationThread.id stays "the Gmail thread ID" externally, even though
// the underlying Prisma row has its own cuid primary key — so this
// migration from the old hand-rolled better-sqlite3 store only required
// small, explainable changes at the call sites (status vocabulary, mostly).

import { Prisma, type Role, type DealStatus as PrismaDealStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { CompanyProfile, MustHave } from "@roost/mcp-server/types";
import { prisma } from "./client.js";

// --- domain types ------------------------------------------------------

export type DealStatus = "SHORTLISTED" | "NEGOTIATING" | "WON" | "LOST";

/** Collapsed at the DB level: "escalated" covers both the round-limit and no-movement-stall stop reasons — the specific reason still lives in the stop_condition transcript event. */
export type ThreadStatus = "active" | "accepted" | "rejected" | "escalated";

export interface Deal {
  id: string;
  companyProfileId: string;
  companyProfile: CompanyProfile;
  status: DealStatus;
  createdAt: number;
}

export interface DealWithMeta extends Deal {
  label: string;
  ownerEmail: string;
}

export interface NegotiationThread {
  id: string; // Gmail (or mock) threadId, agent-side — the external key
  dealId: string;
  listingId: string;
  landlordEmail: string;
  status: ThreadStatus;
  askingPriceInr: number;
  currentOfferInr: number;
  roundsUsed: number;
  priceMovementRounds: number;
  lastLandlordOfferInr: number | null;
  noMovementStreak: number;
  lastConcessionFeaturesJson: string | null;
  lastConcessionFraction: number | null;
  lastMessageId: string | null;
  lastPolledAt: number;
  createdAt: number;
}

export type TranscriptEntryType =
  | "outreach_sent"
  | "reply_received"
  | "intent_classified"
  | "policy_decision"
  | "response_sent"
  | "stop_condition";

export interface TranscriptEntry {
  id: string;
  dealId: string;
  threadId: string;
  timestamp: number;
  type: TranscriptEntryType;
  payload: Record<string, unknown>;
}

// --- enum translation (domain <-> Prisma) -------------------------------

const THREAD_STATUS_TO_DB: Record<ThreadStatus, "ACTIVE" | "ACCEPTED" | "REJECTED" | "ESCALATED"> = {
  active: "ACTIVE",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  escalated: "ESCALATED",
};
const THREAD_STATUS_FROM_DB: Record<string, ThreadStatus> = {
  ACTIVE: "active",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  ESCALATED: "escalated",
};

const EVENT_TYPE_TO_DB: Record<TranscriptEntryType, string> = {
  outreach_sent: "OUTREACH_SENT",
  reply_received: "REPLY_RECEIVED",
  intent_classified: "INTENT_CLASSIFIED",
  policy_decision: "DECISION_MADE",
  response_sent: "EMAIL_SENT",
  stop_condition: "STOP_CONDITION",
};
const EVENT_TYPE_FROM_DB: Record<string, TranscriptEntryType> = {
  OUTREACH_SENT: "outreach_sent",
  REPLY_RECEIVED: "reply_received",
  INTENT_CLASSIFIED: "intent_classified",
  DECISION_MADE: "policy_decision",
  EMAIL_SENT: "response_sent",
  STOP_CONDITION: "stop_condition",
  DEAL_CLOSED: "stop_condition", // unused today, mapped defensively
};

function profileFromRow(row: {
  teamSize: number;
  budgetInr: number;
  preferredArea: string;
  mustHaves: string;
  priceFloorPct: number;
}): CompanyProfile {
  return {
    teamSize: row.teamSize,
    budgetInr: row.budgetInr,
    preferredArea: row.preferredArea,
    mustHaves: JSON.parse(row.mustHaves) as MustHave[],
    priceFloorPct: row.priceFloorPct,
  };
}

function threadFromRow(row: {
  threadId: string;
  dealId: string;
  listingId: string;
  landlordEmail: string;
  status: string;
  askingPriceInr: number;
  currentOfferInr: number;
  roundCount: number;
  priceMovementRounds: number;
  lastLandlordOfferInr: number | null;
  noMovementStreak: number;
  lastConcessionFeaturesJson: string | null;
  lastConcessionFraction: number | null;
  lastMessageId: string | null;
  lastPolledAt: Date;
  createdAt: Date;
}): NegotiationThread {
  return {
    id: row.threadId,
    dealId: row.dealId,
    listingId: row.listingId,
    landlordEmail: row.landlordEmail,
    status: THREAD_STATUS_FROM_DB[row.status] ?? "active",
    askingPriceInr: row.askingPriceInr,
    currentOfferInr: row.currentOfferInr,
    roundsUsed: row.roundCount,
    priceMovementRounds: row.priceMovementRounds,
    lastLandlordOfferInr: row.lastLandlordOfferInr,
    noMovementStreak: row.noMovementStreak,
    lastConcessionFeaturesJson: row.lastConcessionFeaturesJson,
    lastConcessionFraction: row.lastConcessionFraction,
    lastMessageId: row.lastMessageId,
    lastPolledAt: row.lastPolledAt.getTime(),
    createdAt: row.createdAt.getTime(),
  };
}

// --- users ---------------------------------------------------------------

const CLI_USER_EMAIL = "cli@roost.local";

/** Lets the headless CLI (npm run demo/outreach/poll) work without going through Supabase Auth. */
export async function getOrCreateCliUser(): Promise<{ id: string; email: string }> {
  const existing = await prisma.profile.findUnique({ where: { email: CLI_USER_EMAIL }, select: { id: true, email: true } });
  if (existing) return existing;
  return prisma.profile.create({
    data: { id: randomUUID(), email: CLI_USER_EMAIL, name: "CLI test user", role: "COMPANY" },
    select: { id: true, email: true },
  });
}

function roleForEmail(email: string): Role {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase()) ? "ADMIN" : "COMPANY";
}

/**
 * Lazily creates (or updates) the app-level Profile row for a Supabase auth
 * user — this is what replaces NextAuth's signIn callback. Called from
 * packages/web/lib/session.ts on every authenticated request, regardless of
 * whether the user arrived via Google or email/password, so the profile
 * (and its role, re-derived from ADMIN_EMAILS each time) always exists and
 * stays current.
 */
export async function getOrCreateProfile(args: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<{ id: string; email: string; role: Role }> {
  const role = roleForEmail(args.email);
  return prisma.profile.upsert({
    where: { id: args.id },
    update: { email: args.email, name: args.name ?? undefined, role },
    create: { id: args.id, email: args.email, name: args.name ?? undefined, role },
    select: { id: true, email: true, role: true },
  });
}

// --- saved searches (CompanyProfile) --------------------------------------

export interface SavedSearch {
  id: string;
  userId: string;
  label: string;
  profile: CompanyProfile;
  createdAt: number;
}

export async function createCompanyProfile(args: {
  userId: string;
  label: string;
  profile: CompanyProfile;
}): Promise<SavedSearch> {
  const row = await prisma.companyProfile.create({
    data: {
      userId: args.userId,
      label: args.label,
      teamSize: args.profile.teamSize,
      budgetInr: args.profile.budgetInr,
      preferredArea: args.profile.preferredArea,
      mustHaves: JSON.stringify(args.profile.mustHaves),
      priceFloorPct: args.profile.priceFloorPct,
    },
  });
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    profile: profileFromRow(row),
    createdAt: row.createdAt.getTime(),
  };
}

export async function getCompanyProfile(id: string): Promise<SavedSearch | null> {
  const row = await prisma.companyProfile.findUnique({ where: { id } });
  if (!row) return null;
  return { id: row.id, userId: row.userId, label: row.label, profile: profileFromRow(row), createdAt: row.createdAt.getTime() };
}

export async function listCompanyProfilesByUser(userId: string): Promise<SavedSearch[]> {
  const rows = await prisma.companyProfile.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    label: row.label,
    profile: profileFromRow(row),
    createdAt: row.createdAt.getTime(),
  }));
}

// --- deals -----------------------------------------------------------------

export async function createDeal(companyProfileId: string): Promise<Deal> {
  const row = await prisma.deal.create({
    data: { companyProfileId, status: "SHORTLISTED" },
    include: { companyProfile: true },
  });
  return {
    id: row.id,
    companyProfileId: row.companyProfileId,
    companyProfile: profileFromRow(row.companyProfile),
    status: row.status,
    createdAt: row.createdAt.getTime(),
  };
}

export async function getDeal(dealId: string): Promise<Deal | null> {
  const row = await prisma.deal.findUnique({ where: { id: dealId }, include: { companyProfile: true } });
  if (!row) return null;
  return {
    id: row.id,
    companyProfileId: row.companyProfileId,
    companyProfile: profileFromRow(row.companyProfile),
    status: row.status,
    createdAt: row.createdAt.getTime(),
  };
}

/** For ownership checks in the web app's API routes (a plain userId, not a full Deal). */
export async function getDealOwnerUserId(dealId: string): Promise<string | null> {
  const row = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { companyProfile: { select: { userId: true } } },
  });
  return row?.companyProfile.userId ?? null;
}

export async function updateDealStatus(dealId: string, status: DealStatus): Promise<void> {
  await prisma.deal.update({ where: { id: dealId }, data: { status: status as PrismaDealStatus } });
}

export async function listDealsByUser(userId: string): Promise<DealWithMeta[]> {
  const rows = await prisma.deal.findMany({
    where: { companyProfile: { userId } },
    include: { companyProfile: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    companyProfileId: row.companyProfileId,
    companyProfile: profileFromRow(row.companyProfile),
    status: row.status,
    createdAt: row.createdAt.getTime(),
    label: row.companyProfile.label,
    ownerEmail: row.companyProfile.user.email,
  }));
}

export async function listAllDeals(): Promise<DealWithMeta[]> {
  const rows = await prisma.deal.findMany({
    include: { companyProfile: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    companyProfileId: row.companyProfileId,
    companyProfile: profileFromRow(row.companyProfile),
    status: row.status,
    createdAt: row.createdAt.getTime(),
    label: row.companyProfile.label,
    ownerEmail: row.companyProfile.user.email,
  }));
}

// --- shortlist snapshot (what was shown/scored at outreach time) -----------

export async function saveShortlistItems(
  dealId: string,
  items: { listingId: string; totalScore: number; breakdown: Record<string, number>; reasoning: string }[]
): Promise<void> {
  await prisma.shortlistItem.createMany({
    data: items.map((i) => ({
      dealId,
      listingId: i.listingId,
      totalScore: i.totalScore,
      breakdown: JSON.stringify(i.breakdown),
      reasoning: i.reasoning,
    })),
  });
}

// --- negotiation threads -----------------------------------------------------------

export async function createThread(args: {
  threadId: string;
  dealId: string;
  listingId: string;
  landlordEmail: string;
  askingPriceInr: number;
}): Promise<NegotiationThread> {
  const row = await prisma.negotiation.create({
    data: {
      threadId: args.threadId,
      dealId: args.dealId,
      listingId: args.listingId,
      landlordEmail: args.landlordEmail,
      askingPriceInr: args.askingPriceInr,
      currentOfferInr: args.askingPriceInr,
      status: "ACTIVE",
    },
  });
  return threadFromRow(row);
}

export async function getThread(threadId: string): Promise<NegotiationThread | null> {
  const row = await prisma.negotiation.findUnique({ where: { threadId } });
  return row ? threadFromRow(row) : null;
}

export async function getThreadsByDeal(dealId: string): Promise<NegotiationThread[]> {
  const rows = await prisma.negotiation.findMany({ where: { dealId } });
  return rows.map(threadFromRow);
}

export async function getActiveThreadsByDeal(dealId: string): Promise<NegotiationThread[]> {
  const rows = await prisma.negotiation.findMany({ where: { dealId, status: "ACTIVE" } });
  return rows.map(threadFromRow);
}

export async function updateThread(
  threadId: string,
  patch: Partial<{
    status: ThreadStatus;
    currentOfferInr: number;
    roundsUsed: number;
    priceMovementRounds: number;
    lastLandlordOfferInr: number | null;
    noMovementStreak: number;
    lastConcessionFeaturesJson: string | null;
    lastConcessionFraction: number | null;
    lastMessageId: string | null;
    lastPolledAt: number;
  }>
): Promise<void> {
  const data: Prisma.NegotiationUpdateInput = {};
  if (patch.status !== undefined) data.status = THREAD_STATUS_TO_DB[patch.status];
  if (patch.currentOfferInr !== undefined) data.currentOfferInr = patch.currentOfferInr;
  if (patch.roundsUsed !== undefined) data.roundCount = patch.roundsUsed;
  if (patch.priceMovementRounds !== undefined) data.priceMovementRounds = patch.priceMovementRounds;
  if (patch.lastLandlordOfferInr !== undefined) data.lastLandlordOfferInr = patch.lastLandlordOfferInr;
  if (patch.noMovementStreak !== undefined) data.noMovementStreak = patch.noMovementStreak;
  if (patch.lastConcessionFeaturesJson !== undefined) data.lastConcessionFeaturesJson = patch.lastConcessionFeaturesJson;
  if (patch.lastConcessionFraction !== undefined) data.lastConcessionFraction = patch.lastConcessionFraction;
  if (patch.lastMessageId !== undefined) data.lastMessageId = patch.lastMessageId;
  if (patch.lastPolledAt !== undefined) data.lastPolledAt = new Date(patch.lastPolledAt);
  if (Object.keys(data).length === 0) return;
  await prisma.negotiation.update({ where: { threadId }, data });
}

// --- transcript / activity ---------------------------------------------------------------

export async function appendTranscript(entry: {
  dealId: string;
  threadId: string;
  type: TranscriptEntryType;
  payload: Record<string, unknown>;
}): Promise<void> {
  const negotiation = await prisma.negotiation.findUnique({ where: { threadId: entry.threadId }, select: { id: true } });
  if (!negotiation) return; // defensive — shouldn't happen, the thread always exists before events are logged
  await prisma.negotiationEvent.create({
    data: {
      negotiationId: negotiation.id,
      type: EVENT_TYPE_TO_DB[entry.type] as never,
      payload: JSON.stringify(entry.payload),
    },
  });
}

export async function getTranscript(dealId: string): Promise<TranscriptEntry[]> {
  const rows = await prisma.negotiationEvent.findMany({
    where: { negotiation: { dealId } },
    include: { negotiation: { select: { threadId: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    dealId,
    threadId: row.negotiation.threadId,
    timestamp: row.createdAt.getTime(),
    type: EVENT_TYPE_FROM_DB[row.type] ?? "policy_decision",
    payload: JSON.parse(row.payload),
  }));
}

export async function getActivityFeed(args: { userId?: string; limit?: number }): Promise<
  (TranscriptEntry & { listingId: string; dealLabel: string })[]
> {
  const rows = await prisma.negotiationEvent.findMany({
    where: args.userId ? { negotiation: { deal: { companyProfile: { userId: args.userId } } } } : {},
    include: {
      negotiation: { select: { threadId: true, dealId: true, listingId: true, deal: { select: { companyProfile: { select: { label: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: args.limit ?? 50,
  });
  return rows.map((row) => ({
    id: row.id,
    dealId: row.negotiation.dealId,
    threadId: row.negotiation.threadId,
    listingId: row.negotiation.listingId,
    dealLabel: row.negotiation.deal.companyProfile.label,
    timestamp: row.createdAt.getTime(),
    type: EVENT_TYPE_FROM_DB[row.type] ?? "policy_decision",
    payload: JSON.parse(row.payload),
  }));
}

// --- admin overview stats ---------------------------------------------------------------

export async function getAdminStats() {
  const [totalUsers, dealsByStatus, negotiationsByStatus] = await Promise.all([
    prisma.profile.count(),
    prisma.deal.groupBy({ by: ["status"], _count: true }),
    prisma.negotiation.groupBy({ by: ["status"], _count: true }),
  ]);
  return {
    totalUsers,
    dealsByStatus: Object.fromEntries(dealsByStatus.map((d) => [d.status, d._count])),
    negotiationsByStatus: Object.fromEntries(negotiationsByStatus.map((n) => [n.status, n._count])),
  };
}
