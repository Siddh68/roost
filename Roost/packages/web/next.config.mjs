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
  // better-sqlite3 and googleapis are native/server-only — keep them out of
  // the client bundle and let API routes / server components require() them
  // directly at runtime.
  // `bindings` is better-sqlite3's transitive dependency for locating its
  // native .node binary via stack-trace inspection — that trick breaks
  // completely if webpack bundles it (the stack frames become
  // webpack-internal:// URLs, not real file paths), so it must be excluded
  // too, not just better-sqlite3 itself.
  serverExternalPackages: ["better-sqlite3", "bindings", "googleapis"],
  // The mcp-server/orchestrator source uses NodeNext-style ".js"-suffixed
  // relative imports pointing at sibling ".ts" files (needed for tsx/Node to
  // run those packages standalone) — webpack doesn't do that remapping by
  // default, so tell it to also try .ts/.tsx when a ".js" specifier doesn't
  // resolve. Requires running with `next build --webpack` / `next dev
  // --webpack`, since Turbopack (the default) ignores this config entirely.
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };

    // serverExternalPackages' own detection misses better-sqlite3 here
    // because it's nested under packages/orchestrator/node_modules rather
    // than hoisted to the workspace root — force it (and its native-binary
    // loader `bindings`) external explicitly so webpack never touches them.
    if (isServer) {
      const NATIVE_PACKAGES = new Set(["better-sqlite3", "bindings"]);
      const previousExternals = config.externals;
      config.externals = [
        ({ request }, callback) => {
          if (request && NATIVE_PACKAGES.has(request)) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
        ...(Array.isArray(previousExternals) ? previousExternals : previousExternals ? [previousExternals] : []),
      ];
    }

    return config;
  },
};

export default nextConfig;
