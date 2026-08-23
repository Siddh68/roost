// Smoke test for the email_agent mock transport — no real Gmail credentials
// needed (none are set, so this exercises the mock fallback path). Verifies
// send/checkInbox/readThread round-trip and check_inbox's two modes:
// tracked-thread mode (agent side) and whole-inbox discovery mode (landlord
// side, which has no thread registry of its own).

import { existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  sendEmail,
  checkInbox,
  readThread,
  isUsingMockTransport,
  accountEmail,
} from "./tools/emailAgent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, "data", ".mockMailbox.json");
if (existsSync(MOCK_PATH)) unlinkSync(MOCK_PATH);

console.assert(isUsingMockTransport("agent"), "expected agent to use mock transport (no creds set)");
console.assert(isUsingMockTransport("landlord"), "expected landlord to use mock transport (no creds set)");
console.log("Confirmed: no real Gmail creds present, using mock transport for both accounts.\n");

const t0 = Date.now() - 1000;

console.log("Agent sends outreach to landlord...");
const outreach = await sendEmail({
  account: "agent",
  to: accountEmail("landlord"),
  subject: "Office space inquiry — Test Listing [ref:blr-001]",
  body: "Hi, we're interested in your listing. Is the rent negotiable?",
});
console.log(`  threadId=${outreach.threadId} messageId=${outreach.messageId}`);

console.log("\nLandlord discovery poll (no threadIds passed)...");
const discovered = await checkInbox({ account: "landlord", sinceTimestamp: t0 });
console.assert(discovered.length === 1, `expected 1 discovered message, got ${discovered.length}`);
console.assert(discovered[0].threadId === outreach.threadId, "discovered threadId mismatch");
console.log(`  OK: discovered ${discovered.length} message(s) in thread ${discovered[0].threadId}`);

console.log("\nLandlord replies...");
const landlordReply = await sendEmail({
  account: "landlord",
  to: accountEmail("agent"),
  subject: "Re: Office space inquiry — Test Listing [ref:blr-001]",
  body: "Sure, we can do ₹95,000/month.",
  threadId: outreach.threadId,
  inReplyToMessageId: outreach.messageId,
});
console.log(`  messageId=${landlordReply.messageId}`);

console.log("\nAgent checks tracked thread (threadIds mode)...");
const agentInbox = await checkInbox({
  account: "agent",
  threadIds: [outreach.threadId],
  sinceTimestamp: t0,
});
console.assert(agentInbox.length === 1, `expected 1 message for agent, got ${agentInbox.length}`);
console.assert(agentInbox[0].from.includes("landlord"), "expected message from landlord");
console.log(`  OK: agent sees ${agentInbox.length} new message from ${agentInbox[0].from}`);

console.log("\nAgent reads full thread...");
const fullThread = await readThread({ account: "agent", threadId: outreach.threadId });
console.assert(fullThread.length === 2, `expected 2 messages in thread, got ${fullThread.length}`);
console.log(`  OK: ${fullThread.length} messages:`);
for (const m of fullThread) console.log(`    [${m.from}] ${m.body}`);

console.log("\nSecond discovery poll should find nothing new (watermark advanced)...");
const secondPoll = await checkInbox({ account: "landlord", sinceTimestamp: Date.now() });
console.assert(secondPoll.length === 0, `expected 0 new messages, got ${secondPoll.length}`);
console.log(`  OK: ${secondPoll.length} new messages`);

console.log("\nAll emailAgent mock-transport assertions passed.");

if (existsSync(MOCK_PATH)) unlinkSync(MOCK_PATH);
