// Maps a Deal to the single Gmail thread the client emailed in on — every
// client-facing email for that deal (shortlist confirmation, follow-ups,
// win/loss outcome) replies into this one thread, never a new one.
//
// Both of agent.js's loops (client-intake and poll-all) can touch this same
// key concurrently — client-intake creates entries, poll-all updates
// pendingPriceChange/lastMessageId on possibly-different deals in the same
// shared blob — so every mutation goes through updateAgentState's atomic
// read-modify-write instead of a separate load()+save(), which would have
// a real race window between them.
import { updateAgentState, loadAgentState } from "./agentState.js";

const DB_KEY = "dealClientThreads";

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

type Registry = Record<string, DealClientThread>;

export async function recordDealClientThread(dealId: string, info: DealClientThread): Promise<void> {
  await updateAgentState<Registry>(DB_KEY, (current) => {
    const state = current ?? {};
    state[dealId] = info;
    return state;
  });
}

export async function getDealClientThread(dealId: string): Promise<DealClientThread | null> {
  try {
    const state = await loadAgentState<Registry>(DB_KEY);
    return state?.[dealId] ?? null;
  } catch (err) {
    console.error("[clientThreadRegistry] read failed:", err);
    return null;
  }
}

export async function updateLastClientMessageId(dealId: string, messageId: string): Promise<void> {
  await updateAgentState<Registry>(DB_KEY, (current) => {
    const state = current ?? {};
    if (state[dealId]) state[dealId].lastMessageId = messageId;
    return state;
  });
}

export async function setPendingPriceChange(dealId: string, change: PendingPriceChange): Promise<void> {
  await updateAgentState<Registry>(DB_KEY, (current) => {
    const state = current ?? {};
    if (state[dealId]) state[dealId].pendingPriceChange = change;
    return state;
  });
}

export async function clearPendingPriceChange(dealId: string): Promise<void> {
  await updateAgentState<Registry>(DB_KEY, (current) => {
    const state = current ?? {};
    if (state[dealId]) state[dealId].pendingPriceChange = null;
    return state;
  });
}
