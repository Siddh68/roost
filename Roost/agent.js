// Entry point for Hostinger's cPanel "Setup Node.js App" (Passenger) — the
// SECOND app entry, separate from app.js (the website). Runs the two
// background loops that actually send/read emails: client-intake (replies
// to inbound client mail) and poll-all (negotiates with landlords, replies
// on already-accepted threads). Neither depends on the web app or on any
// external LLM API — both are plain classical-ML Node processes.
//
// tsx/cjs hooks require() so this plain-Node bootstrap can load the
// orchestrator's raw TypeScript source directly, same as `npx tsx` does —
// no separate build step needed.
require("tsx/cjs");

const path = require("path");
const http = require("http");

// Render (and most free/no-card PaaS free tiers) only offer a "Web Service"
// deploy type on their free plan — actual background workers are paid-only
// — so this process needs to bind a port and answer HTTP for the platform's
// health checks, even though its real job is the two loops below, not
// serving requests. Harmless no-op on Hostinger, which doesn't require this.
function startHealthServer() {
  const port = process.env.PORT || 3001;
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Roost agent is running.\n");
    })
    .listen(port, () => {
      console.log(`Health check server listening on port ${port}.`);
    });
}

async function main() {
  startHealthServer();

  const { runClientIntakeLoop } = require(
    path.join(__dirname, "packages/orchestrator/src/negotiation/clientIntake.ts")
  );
  const { runPollAllLoop } = require(
    path.join(__dirname, "packages/orchestrator/src/negotiation/stateMachine.ts")
  );

  const clientIntakeIntervalMs = Number(process.env.CLIENT_INTAKE_INTERVAL_MS || 5000);
  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 5000);

  console.log(`Roost agent starting — client-intake every ${clientIntakeIntervalMs}ms, poll-all every ${pollIntervalMs}ms.`);

  // Both loops run forever and are independent — start them together,
  // never awaiting either to completion.
  await Promise.all([
    runClientIntakeLoop(clientIntakeIntervalMs),
    runPollAllLoop(pollIntervalMs),
  ]);
}

main().catch((err) => {
  console.error("Roost agent crashed:", err);
  process.exit(1);
});
