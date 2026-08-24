// Maps a Deal to the single Gmail thread the client emailed in on — every
// client-facing email for that deal (shortlist confirmation, follow-ups,
// win/loss outcome) replies into this one thread, never a new one.
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = join(__dirname, "..", "..", "data", ".dealClientThreads.json");

export interface PendingPriceChange {
  /** The landlord-side Negotiation thread id this change came in on. */
  landlordThreadId: string;
  listingId: string;
  newPriceInr: number;
  previousPriceInr: number;
}

export interface DealClientThread {
  threadId: string;
  lastMessageId: string;
  clientEmail: string;
  cc?: string;
  pendingPriceChange?: PendingPriceChange | null;
}

function load(): Record<string, DealClientThread> {
  if (!existsSync(PATH)) return {};
  try {
    return JSON.parse(readFileSync(PATH, "utf-8")) as Record<string, DealClientThread>;
  } catch (err) {
    console.error("[clientThreadRegistry] state file corrupted, resetting:", err);
    return {};
  }
}

function save(state: Record<string, DealClientThread>): void {
  const tmpPath = `${PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, PATH);
}

export function recordDealClientThread(dealId: string, info: DealClientThread): void {
  const state = load();
  state[dealId] = info;
  save(state);
}

export function getDealClientThread(dealId: string): DealClientThread | null {
  return load()[dealId] ?? null;
}

export function updateLastClientMessageId(dealId: string, messageId: string): void {
  const state = load();
  if (state[dealId]) {
    state[dealId].lastMessageId = messageId;
    save(state);
  }
}

export function setPendingPriceChange(dealId: string, change: PendingPriceChange): void {
  const state = load();
  if (state[dealId]) {
    state[dealId].pendingPriceChange = change;
    save(state);
  }
}

export function clearPendingPriceChange(dealId: string): void {
  const state = load();
  if (state[dealId]) {
    state[dealId].pendingPriceChange = null;
    save(state);
  }
}
