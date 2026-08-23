// MCP server entrypoint. Exposes search_listings, score_listings, and the
// three email_agent actions (send_email, check_inbox, read_thread) over
// stdio for any MCP client (the orchestrator, Claude Desktop, etc.) to call.

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchListings } from "./tools/searchListings.js";
import { scoreListing } from "./tools/scoreListing.js";

// npm workspaces run this with cwd = packages/mcp-server, so the bare
// "dotenv/config" import would look for .env there instead of the repo root.
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env") });
import { sendEmail, checkInbox, readThread } from "./tools/emailAgent.js";
import type { CompanyProfile } from "./types.js";

const server = new McpServer({ name: "roost-mcp-server", version: "0.1.0" });

const mustHaveEnum = z.enum(["metro", "cab", "parking", "furnished"]);

server.registerTool(
  "search_listings",
  {
    title: "Search listings",
    description: "Filter the seeded office listings dataset by area, budget, seats, and must-haves.",
    inputSchema: {
      area: z.string().optional(),
      maxBudget: z.number().optional(),
      minSeats: z.number().optional(),
      mustHaves: z.array(mustHaveEnum).optional(),
    },
  },
  async (args) => {
    const results = searchListings(args);
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

server.registerTool(
  "score_listings",
  {
    title: "Score listings",
    description:
      "Score listings (optionally restricted to a set of ids) against a company profile. Returns ranked results with a per-listing breakdown and reasoning.",
    inputSchema: {
      profile: z.object({
        teamSize: z.number(),
        budgetInr: z.number(),
        preferredArea: z.string(),
        mustHaves: z.array(mustHaveEnum),
        priceFloorPct: z.number(),
      }),
      listingIds: z.array(z.string()).optional(),
    },
  },
  async (args) => {
    const results = scoreListing(args.profile as CompanyProfile, args.listingIds);
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

const accountEnum = z.enum(["agent", "landlord"]);

server.registerTool(
  "send_email",
  {
    title: "Send email",
    description:
      "Send an email from the agent or landlord test account via Gmail. Pass threadId + inReplyToMessageId when replying within an existing negotiation thread.",
    inputSchema: {
      account: accountEnum,
      to: z.string(),
      subject: z.string(),
      body: z.string(),
      threadId: z.string().optional(),
      inReplyToMessageId: z.string().optional(),
    },
  },
  async (args) => {
    const result = await sendEmail(args);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "check_inbox",
  {
    title: "Check inbox",
    description:
      "List new incoming messages since a timestamp. Pass threadIds to check specific tracked threads, or omit to discover new threads across the whole inbox.",
    inputSchema: {
      account: accountEnum,
      threadIds: z.array(z.string()).optional(),
      sinceTimestamp: z.number(),
    },
  },
  async (args) => {
    const result = await checkInbox(args);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "read_thread",
  {
    title: "Read thread",
    description: "Read the full content of an email thread.",
    inputSchema: {
      account: accountEnum,
      threadId: z.string(),
    },
  },
  async (args) => {
    const result = await readThread(args);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("roost-mcp-server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
