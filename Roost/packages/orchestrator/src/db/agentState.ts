// Key-value persistence for everything that used to live in local JSON
// files under packages/orchestrator/data — ML model weights and the
// poll-cursor/dedup state the always-on agent loops depend on. Backed by
// the AgentState table (see prisma/schema.prisma) instead of the local
// filesystem so the agent process can run on a host with an ephemeral disk
// (serverless, or a free-tier container that gets wiped on restart)
// without losing state and re-sending duplicate outreach.

import { prisma } from "./client.js";

export async function loadAgentState<T>(key: string): Promise<T | null> {
  const row = await prisma.agentState.findUnique({ where: { key } });
  if (!row) return null;
  return JSON.parse(row.value) as T;
}

export async function saveAgentState(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.agentState.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
}

/**
 * Atomic read-modify-write for a key that can have concurrent writers (e.g.
 * a key touched by both of agent.js's loops). A plain loadAgentState() +
 * mutate-in-memory + saveAgentState() has a real await gap between the read
 * and the write — unlike the old synchronous file I/O this replaced, two
 * concurrent callers CAN interleave in that gap and the later save silently
 * clobbers the earlier one's write. This wraps the read-modify-write in one
 * transaction with `SELECT ... FOR UPDATE`, which makes a second concurrent
 * call block until the first one's transaction commits, instead of racing.
 */
export async function updateAgentState<T>(key: string, mutate: (current: T | null) => T): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ value: string }[]>`
      SELECT value FROM "AgentState" WHERE key = ${key} FOR UPDATE
    `;
    const current = rows[0] ? (JSON.parse(rows[0].value) as T) : null;
    const next = mutate(current);
    const json = JSON.stringify(next);
    await tx.agentState.upsert({
      where: { key },
      create: { key, value: json },
      update: { value: json },
    });
    return next;
  });
}
