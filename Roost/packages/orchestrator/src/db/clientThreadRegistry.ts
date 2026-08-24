// Maps a Deal to the single Gmail thread the client emailed in on — every
// client-facing email for that deal (shortlist confirmation, follow-ups,
// win/loss outcome) replies into this one thread, never a new one.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = join(__dirname, "..", "..", "data", ".dealClientThreads.json");

export interface DealClientThread {
  threadId: string;
  lastMessageId: string;
  clientEmail: string;
  cc?: string;
}

function load(): Record<string, DealClientThread> {
  if (!existsSync(PATH)) return {};
  return JSON.parse(readFileSync(PATH, "utf-8")) as Record<string, DealClientThread>;
}

function save(state: Record<string, DealClientThread>): void {
  writeFileSync(PATH, JSON.stringify(state, null, 2), "utf-8");
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
