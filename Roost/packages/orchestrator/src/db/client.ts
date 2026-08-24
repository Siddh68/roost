// Prisma client singleton. Loads the root .env itself (rather than relying
// on callers to have done it first) so this module works whether it's
// imported from the orchestrator CLI, the web app's API routes, or
// NextAuth's Prisma adapter — all of which need DATABASE_URL populated
// before PrismaClient is constructed.

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", "..", "..", "..", ".env") });

declare global {
  // eslint-disable-next-line no-var
  var __roostPrisma: PrismaClient | undefined;
}

// Reuse a single instance across hot-reloads / re-imports (Next.js dev
// server re-evaluates modules on every change — without this, each reload
// would open a fresh SQLite connection and eventually exhaust file handles).
export const prisma: PrismaClient = globalThis.__roostPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__roostPrisma = prisma;
}
