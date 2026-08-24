import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Next.js only auto-loads .env* files from its OWN directory (packages/web),
// never the monorepo root where the real .env (Gmail creds) lives — without
// this, every API route silently falls back to the mock email transport
// (accountEmail() sees no env vars and returns a mock@... identity that
// doesn't match the real landlord address baked into the seed data, so the
// landlord auto-responder's discovery poll never finds anything). Setting
// process.env here, before nextConfig is even built, propagates to the
// whole dev/build/start process since it's all one Node process.
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // These workspace packages ship raw TS source (no build step) referenced
  // via package.json "exports" — transpilePackages runs them through
  // Next's own compiler instead of treating them as prebuilt, which is also
  // what makes their NodeNext-style ".js"-suffixed relative imports resolve
  // correctly to sibling ".ts" files.
  transpilePackages: ["@roost/mcp-server", "@roost/orchestrator"],
  // @prisma/client and googleapis are native/server-only — keep them out of
  // the client bundle and let API routes / server components require() them
  // directly at runtime.
  serverExternalPackages: ["@prisma/client", "googleapis"],
  // The mcp-server/orchestrator source uses NodeNext-style ".js"-suffixed
  // relative imports pointing at sibling ".ts" files (needed for tsx/Node to
  // run those packages standalone) — webpack doesn't do that remapping by
  // default, so tell it to also try .ts/.tsx when a ".js" specifier doesn't
  // resolve. Requires running with `next build --webpack` / `next dev
  // --webpack`, since Turbopack (the default) ignores this config entirely.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
