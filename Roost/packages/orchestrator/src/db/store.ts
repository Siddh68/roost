// SQLite persistence for deals, negotiation threads, and the transcript log
// the dashboard reads from. One deal = one company intake; one thread per
// listing being negotiated within that deal.

import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CompanyProfile } from "@roost/mcp-server/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, "..", "..", "data", "roost.sqlite");

export type DealStatus = "shortlisted" | "negotiating" | "closed";

export type ThreadStatus =
  | "active"
  | "accepted"
  | "rejected"
  | "stop_floor_breach"
  | "stop_round_limit";

export interface Deal {
  id: string;
  companyProfile: CompanyProfile;
  status: DealStatus;
  createdAt: number;
}

export interface NegotiationThread {
  id: string; // Gmail (or mock) threadId, agent-side
  dealId: string;
  listingId: string;
  landlordEmail: string;
  status: ThreadStatus;
  askingPriceInr: number;
  currentOfferInr: number;
  roundsUsed: number;
  priceMovementRounds: number;
  /** Landlord's price from the previous round, for movement detection. */
  lastLandlordOfferInr: number | null;
  /** Consecutive rounds the landlord has held above budget with no meaningful movement. */
  noMovementStreak: number;
  /** Features + fraction from the most recent ladder-movement counter, JSON-encoded — replayed into concessionModel.update() once the thread reaches a terminal state. */
  lastConcessionFeaturesJson: string | null;
  lastConcessionFraction: number | null;
  lastMessageId: string | null;
  lastPolledAt: number;
  createdAt: number;
}

export type TranscriptEntryType =
  | "outreach_sent"
  | "intent_classified"
  | "policy_decision"
  | "response_sent"
  | "stop_condition";

export interface TranscriptEntry {
  id: number;
  dealId: string;
  threadId: string;
  timestamp: number;
  type: TranscriptEntryType;
  payload: Record<string, unknown>;
}

let db: Database.Database | null = null;

export function getDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  if (db) return db;
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      companyProfile TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      dealId TEXT NOT NULL,
      listingId TEXT NOT NULL,
      landlordEmail TEXT NOT NULL,
      status TEXT NOT NULL,
      askingPriceInr INTEGER NOT NULL,
      currentOfferInr INTEGER NOT NULL,
      roundsUsed INTEGER NOT NULL DEFAULT 0,
      priceMovementRounds INTEGER NOT NULL DEFAULT 0,
      lastLandlordOfferInr INTEGER,
      noMovementStreak INTEGER NOT NULL DEFAULT 0,
      lastConcessionFeaturesJson TEXT,
      lastConcessionFraction REAL,
      lastMessageId TEXT,
      lastPolledAt INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (dealId) REFERENCES deals(id)
    );

    CREATE TABLE IF NOT EXISTS transcript (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dealId TEXT NOT NULL,
      threadId TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_threads_deal ON threads(dealId);
    CREATE INDEX IF NOT EXISTS idx_transcript_deal ON transcript(dealId);
  `);
  migrate(db);
  return db;
}

/**
 * CREATE TABLE IF NOT EXISTS doesn't retroactively add columns to a table
 * that already existed under an older schema — this is a hackathon
 * prototype's dev DB, not something worth a real migration framework for,
 * but a one-line ALTER TABLE per new column keeps `npm run demo` from
 * breaking every time the schema grows.
 */
function migrate(database: Database.Database): void {
  const existingColumns = new Set(
    (database.pragma("table_info(threads)") as Array<{ name: string }>).map((c) => c.name)
  );
  const columnsToEnsure: Record<string, string> = {
    lastConcessionFeaturesJson: "TEXT",
    lastConcessionFraction: "REAL",
  };
  for (const [column, type] of Object.entries(columnsToEnsure)) {
    if (!existingColumns.has(column)) {
      database.exec(`ALTER TABLE threads ADD COLUMN ${column} ${type}`);
    }
  }
}

// --- deals ---------------------------------------------------------------

export function createDeal(companyProfile: CompanyProfile): Deal {
  const deal: Deal = {
    id: randomUUID(),
    companyProfile,
    status: "shortlisted",
    createdAt: Date.now(),
  };
  getDb()
    .prepare(
      `INSERT INTO deals (id, companyProfile, status, createdAt) VALUES (?, ?, ?, ?)`
    )
    .run(deal.id, JSON.stringify(deal.companyProfile), deal.status, deal.createdAt);
  return deal;
}

export function getDeal(dealId: string): Deal | null {
  const row = getDb()
    .prepare(`SELECT * FROM deals WHERE id = ?`)
    .get(dealId) as any;
  if (!row) return null;
  return {
    id: row.id,
    companyProfile: JSON.parse(row.companyProfile),
    status: row.status,
    createdAt: row.createdAt,
  };
}

export function updateDealStatus(dealId: string, status: DealStatus): void {
  getDb().prepare(`UPDATE deals SET status = ? WHERE id = ?`).run(status, dealId);
}

export function listDeals(): Deal[] {
  const rows = getDb().prepare(`SELECT * FROM deals ORDER BY createdAt DESC`).all() as any[];
  return rows.map((row) => ({
    id: row.id,
    companyProfile: JSON.parse(row.companyProfile),
    status: row.status,
    createdAt: row.createdAt,
  }));
}

// --- threads ---------------------------------------------------------------

export function createThread(args: {
  threadId: string;
  dealId: string;
  listingId: string;
  landlordEmail: string;
  askingPriceInr: number;
}): NegotiationThread {
  const thread: NegotiationThread = {
    id: args.threadId,
    dealId: args.dealId,
    listingId: args.listingId,
    landlordEmail: args.landlordEmail,
    status: "active",
    askingPriceInr: args.askingPriceInr,
    currentOfferInr: args.askingPriceInr,
    roundsUsed: 0,
    priceMovementRounds: 0,
    lastLandlordOfferInr: null,
    noMovementStreak: 0,
    lastConcessionFeaturesJson: null,
    lastConcessionFraction: null,
    lastMessageId: null,
    lastPolledAt: Date.now(),
    createdAt: Date.now(),
  };
  getDb()
    .prepare(
      `INSERT INTO threads (id, dealId, listingId, landlordEmail, status, askingPriceInr, currentOfferInr, roundsUsed, priceMovementRounds, lastLandlordOfferInr, noMovementStreak, lastConcessionFeaturesJson, lastConcessionFraction, lastMessageId, lastPolledAt, createdAt)
       VALUES (@id, @dealId, @listingId, @landlordEmail, @status, @askingPriceInr, @currentOfferInr, @roundsUsed, @priceMovementRounds, @lastLandlordOfferInr, @noMovementStreak, @lastConcessionFeaturesJson, @lastConcessionFraction, @lastMessageId, @lastPolledAt, @createdAt)`
    )
    .run(thread);
  return thread;
}

export function getThread(threadId: string): NegotiationThread | null {
  const row = getDb().prepare(`SELECT * FROM threads WHERE id = ?`).get(threadId) as
    | NegotiationThread
    | undefined;
  return row ?? null;
}

export function getThreadsByDeal(dealId: string): NegotiationThread[] {
  return getDb()
    .prepare(`SELECT * FROM threads WHERE dealId = ?`)
    .all(dealId) as NegotiationThread[];
}

export function getActiveThreadsByDeal(dealId: string): NegotiationThread[] {
  return getDb()
    .prepare(`SELECT * FROM threads WHERE dealId = ? AND status = 'active'`)
    .all(dealId) as NegotiationThread[];
}

export function updateThread(
  threadId: string,
  patch: Partial<
    Pick<
      NegotiationThread,
      | "status"
      | "currentOfferInr"
      | "roundsUsed"
      | "priceMovementRounds"
      | "lastLandlordOfferInr"
      | "noMovementStreak"
      | "lastConcessionFeaturesJson"
      | "lastConcessionFraction"
      | "lastMessageId"
      | "lastPolledAt"
    >
  >
): void {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
  getDb()
    .prepare(`UPDATE threads SET ${setClause} WHERE id = @id`)
    .run({ ...patch, id: threadId });
}

// --- transcript ---------------------------------------------------------------

export function appendTranscript(entry: {
  dealId: string;
  threadId: string;
  type: TranscriptEntryType;
  payload: Record<string, unknown>;
}): void {
  getDb()
    .prepare(
      `INSERT INTO transcript (dealId, threadId, timestamp, type, payload) VALUES (?, ?, ?, ?, ?)`
    )
    .run(entry.dealId, entry.threadId, Date.now(), entry.type, JSON.stringify(entry.payload));
}

export function getTranscript(dealId: string): TranscriptEntry[] {
  const rows = getDb()
    .prepare(`SELECT * FROM transcript WHERE dealId = ? ORDER BY timestamp ASC`)
    .all(dealId) as any[];
  return rows.map((row) => ({
    id: row.id,
    dealId: row.dealId,
    threadId: row.threadId,
    timestamp: row.timestamp,
    type: row.type,
    payload: JSON.parse(row.payload),
  }));
}
