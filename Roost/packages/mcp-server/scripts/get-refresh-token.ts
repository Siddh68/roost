// One-time helper to mint a Gmail OAuth refresh token for one account.
// Run once per account (agent, then landlord) — see BUILD_SPEC.md Section 6.
//
// Usage:
//   OAUTH_CLIENT_ID=... OAUTH_CLIENT_SECRET=... npm run get-token --workspace=packages/mcp-server
//
// Log in with the account you want a token for when the browser opens.
// Copy the printed refresh token into .env as GMAIL_AGENT_REFRESH_TOKEN or
// GMAIL_LANDLORD_REFRESH_TOKEN, then repeat for the other account.

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { google } from "googleapis";
import express from "express";
import open from "open";

// npm workspaces run this with cwd = packages/mcp-server, so the bare
// "dotenv/config" import would look for .env there instead of the repo root.
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env") });

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET.\n" +
      "Set them as env vars before running this script, e.g.:\n" +
      "  OAUTH_CLIENT_ID=xxx OAUTH_CLIENT_SECRET=yyy npm run get-token --workspace=packages/mcp-server"
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to get a refresh_token back
  prompt: "consent", // forces refresh_token even on repeat runs
  scope: SCOPES,
});

const app = express();

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    res.status(400).send(`OAuth error: ${error}. Check the terminal and try again.`);
    console.error(`\nOAuth error: ${error}\n`);
    process.exit(1);
  }

  if (!code) {
    res.status(400).send("No authorization code received.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh_token in the response. This usually means you've already " +
          "granted consent before without `prompt: consent` forcing a fresh one — " +
          "this script already sets that, so if it happens, revoke the app's access " +
          "at https://myaccount.google.com/permissions and try again.\n"
      );
      res.send("No refresh token received — see terminal for details.");
      process.exit(1);
    }

    console.log("\n=== SAVE THIS REFRESH TOKEN ===");
    console.log(tokens.refresh_token);
    console.log("================================\n");
    res.send("Done — refresh token printed in your terminal. You can close this tab.");
    process.exit(0);
  } catch (err) {
    console.error("\nFailed to exchange code for tokens:", err);
    res.status(500).send("Token exchange failed — see terminal for details.");
    process.exit(1);
  }
});

app.listen(3000, () => {
  console.log("Opening browser for Google sign-in...");
  console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);
  open(authUrl);
});
