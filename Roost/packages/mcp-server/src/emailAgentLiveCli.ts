// Live Gmail smoke test — sends a real email agent -> landlord, verifies
// discovery + threading, replies landlord -> agent, verifies the agent sees
// it. Run only once GMAIL_*_REFRESH_TOKEN are set in .env for both accounts.

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env") });

import { sendEmail, checkInbox, readThread, isUsingMockTransport, accountEmail } from "./tools/emailAgent.js";

console.log(`agent using mock: ${isUsingMockTransport("agent")} (${accountEmail("agent")})`);
console.log(`landlord using mock: ${isUsingMockTransport("landlord")} (${accountEmail("landlord")})`);
if (isUsingMockTransport("agent") || isUsingMockTransport("landlord")) {
  console.error("\nOne or both accounts still lack real credentials — aborting live test.");
  process.exit(1);
}

const t0 = Date.now() - 5000;

console.log("\n1. Agent sends a real outreach email to landlord...");
const outreach = await sendEmail({
  account: "agent",
  to: accountEmail("landlord"),
  subject: "Roost live wiring test — encoding fix check [ref:live-test]",
  body: "This is an automated wiring test for the Roost hackathon project. Please ignore — a bot reply will follow shortly, this thread can be deleted.",
});
console.log(`   agent-side threadId=${outreach.threadId}`);
console.log(`   rfc822 messageId=${outreach.messageId}`);

console.log("\n2. Waiting a few seconds for Gmail to deliver...");
await new Promise((r) => setTimeout(r, 8000));

console.log("\n3. Landlord discovery poll (no threadIds — whole inbox scan)...");
const discovered = await checkInbox({ account: "landlord", sinceTimestamp: t0 });
const found = discovered.find((m) => m.from.toLowerCase().includes(accountEmail("agent").toLowerCase()));
if (!found) {
  console.error("   FAILED: landlord did not see the outreach message.");
  console.log("   all discovered:", discovered);
  process.exit(1);
}
console.log(`   OK: landlord discovered it in their own threadId=${found.threadId}`);

console.log("\n4. Landlord replies...");
const reply = await sendEmail({
  account: "landlord",
  to: accountEmail("agent"),
  subject: "Re: Roost live wiring test — encoding fix check [ref:live-test]",
  body: "Wiring test acknowledged — reply received and threaded correctly. This thread can be deleted.",
  threadId: found.threadId,
  inReplyToMessageId: found.messageId,
});
console.log(`   landlord-side threadId=${reply.threadId}`);

console.log("\n5. Waiting a few seconds for Gmail to deliver the reply...");
await new Promise((r) => setTimeout(r, 8000));

console.log("\n6. Agent checks its own thread for the reply...");
const agentInbox = await checkInbox({
  account: "agent",
  threadIds: [outreach.threadId],
  sinceTimestamp: t0,
});
const agentSawReply = agentInbox.find((m) => m.from.toLowerCase().includes("sidsaachijain"));
if (!agentSawReply) {
  console.error("   FAILED: agent did not see the landlord's reply in its own thread.");
  console.log("   agent inbox:", agentInbox);
  process.exit(1);
}
console.log(`   OK: agent sees the reply, threaded correctly on its own side too.`);

console.log("\n7. Reading full thread from the agent's side...");
const fullThread = await readThread({ account: "agent", threadId: outreach.threadId });
for (const m of fullThread) {
  console.log(`   [${m.from}] ${m.body.slice(0, 80)}`);
}

console.log("\nAll live Gmail wiring checks passed. Cross-mailbox threading confirmed working.");
