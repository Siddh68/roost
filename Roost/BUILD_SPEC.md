# Roost — Build Spec for Claude Code

Read this fully before writing any code. This is the handoff spec for a 3-day
hackathon prototype: an AI agent that searches, scores, and shortlists office
listings for a company, then autonomously negotiates over email with zero
human approval per message.

Stack decision: **Node.js + TypeScript** throughout (orchestrator, MCP server,
frontend API routes). Frontend: Next.js + Tailwind.

---

## 1. What "done" looks like for the demo

A working end-to-end flow:

1. User fills in a company intake form (team size, budget, area, must-haves).
2. Agent searches seeded listings, scores them, shows a ranked shortlist.
3. Agent sends real outreach emails (Gmail API) to the top 2-3 listings.
4. Agent polls the inbox, parses replies, decides a negotiation move, and
   responds automatically — no human approves any individual message.
5. Dashboard shows the live negotiation transcript, reasoning at each step,
   and a final savings number once a deal is reached or a round limit hits.

Two Gmail accounts needed (see Section 5): one as "the agent," one as a
demo stand-in for "the landlord" (auto-responder — see Section 5.3). This is
test infrastructure only, not a product feature — never expose it as a
"landlord AI agent" anywhere in the UI or docs.

---

## 2. Repo structure

```
roost/
├── package.json                 # npm workspaces root
├── .env                          # secrets (gitignored)
├── .env.example
├── packages/
│   ├── mcp-server/                # MCP tools: search, score, email
│   │   ├── src/
│   │   │   ├── index.ts           # MCP server entrypoint
│   │   │   ├── tools/
│   │   │   │   ├── searchListings.ts
│   │   │   │   ├── scoreListing.ts
│   │   │   │   └── emailAgent.ts  # send/checkInbox/readThread
│   │   │   ├── data/
│   │   │   │   ├── listings.seed.json
│   │   │   │   └── metroStations.seed.json
│   │   │   └── scoring/
│   │   │       └── scoreEngine.ts
│   │   └── package.json
│   ├── orchestrator/               # Core agent loop, calls MCP tools
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── negotiation/
│   │   │   │   ├── stateMachine.ts # poll → parse → decide → act
│   │   │   │   ├── policy.ts       # price floor/ceiling, round limits
│   │   │   │   └── landlordAutoResponder.ts  # TEST ONLY, see 5.3
│   │   │   └── db/
│   │   │       └── store.ts        # SQLite: deals, threads, transcript
│   │   └── package.json
│   └── web/                        # Next.js dashboard
│       ├── app/
│       │   ├── intake/page.tsx
│       │   ├── shortlist/[dealId]/page.tsx
│       │   └── negotiation/[dealId]/page.tsx
│       └── package.json
└── README.md
```

Use npm workspaces (root `package.json` with `"workspaces": ["packages/*"]`)
so the three packages can import shared types easily.

---

## 3. Data layer

### 3.1 Seed listings (`listings.seed.json`)

Generate ~60-80 synthetic but realistic listings. Each:

```ts
interface Listing {
  id: string;
  title: string;
  area: string;              // neighborhood/locality name
  lat: number;
  lng: number;
  monthlyRentInr: number;
  seats: number;
  furnished: boolean;
  parking: boolean;
  cabAvailability: "high" | "medium" | "low";
  floor: number;
  landlordEmail: string;     // route to the ONE demo landlord inbox for all
  landlordName: string;
  contactPersona?: string;   // optional flavor for auto-responder prompt
}
```

Base the demo city coordinates on a real city (ask the user which — default
to Bengaluru since that's their location) and geocode 8-12 real metro
stations for that city into `metroStations.seed.json`. This makes the
commute-score math real, not fabricated.

### 3.2 Company intake shape

```ts
interface CompanyProfile {
  teamSize: number;
  budgetInr: number;          // monthly budget ceiling
  preferredArea: string;
  mustHaves: ("metro" | "cab" | "parking" | "furnished")[];
  priceFloorPct: number;      // e.g. 0.85 = will not go below 85% of budget as a "steal" threshold; mainly used for negotiation ceiling logic
}
```

---

## 4. Scoring engine (`scoreEngine.ts`)

Score each listing 0-100, weighted:

- **Cost efficiency (45%)**: `idealSeats = teamSize` (allow +1 buffer max).
  Penalize both oversized (paying for unused seats) and undersized listings.
  Compute `costPerNeededSeat = monthlyRent / max(seats, teamSize)` and compare
  against the dataset's median ₹/seat for that area.
- **Commute score (30%)**: haversine distance from listing lat/lng to the
  nearest seeded metro station. Score decays with distance (e.g. full score
  under 500m, tapering to 0 past 3km). Add a cab-availability modifier.
- **Amenity fit (25%)**: match against `mustHaves` — parking, furnished,
  floor preference if specified. Simple weighted checklist.

Return a breakdown object, not just a total — the dashboard should show
*why* a listing scored the way it did (this is a strong demo detail: judges
can see the reasoning, not just a black-box number).

```ts
interface ScoreResult {
  listingId: string;
  totalScore: number;
  breakdown: {
    costEfficiency: number;
    commute: number;
    amenityFit: number;
  };
  reasoning: string; // 1-2 sentence natural-language explanation
}
```

---

## 5. Autonomous email negotiation

### 5.1 Gmail API setup (do this once, see Section 6 for exact steps)

Use `googleapis` npm package with OAuth2. Store refresh tokens in `.env`,
never commit them.

```
GMAIL_AGENT_CLIENT_ID=
GMAIL_AGENT_CLIENT_SECRET=
GMAIL_AGENT_REFRESH_TOKEN=
GMAIL_AGENT_EMAIL=

GMAIL_LANDLORD_CLIENT_ID=
GMAIL_LANDLORD_CLIENT_SECRET=
GMAIL_LANDLORD_REFRESH_TOKEN=
GMAIL_LANDLORD_EMAIL=

ANTHROPIC_API_KEY=
```

### 5.2 `email_agent` MCP tool

Three actions:

- `send_email({ to, subject, body, threadId? })` — sends via Gmail API,
  returns the Gmail thread ID.
- `check_inbox({ sinceTimestamp })` — lists new messages in tracked threads.
- `read_thread({ threadId })` — full thread content for context.

### 5.3 The negotiation state machine (`stateMachine.ts`)

This is the centerpiece — build and test this before touching the frontend.

```
poll (every 30-45s in demo mode)
  → new message in a tracked thread?
    → parse intent via Claude call: classify as
      accept | counter_offer | reject | needs_info | off_topic
    → apply policy (policy.ts):
        - counter_offer within [priceFloor, budget] → accept, or counter
          with a smaller gap (simple negotiation ladder, e.g. split the
          difference, cap at 3 rounds of movement)
        - counter_offer below priceFloor → counsel a firm counter citing
          comparable listings from the seed data
        - needs_info → answer directly using listing + company profile
          context already available
        - reject → log as closed-lost, remove from shortlist
    → generate response via Claude call (the actual email body)
    → send_email via MCP tool
    → log every step (intent classification + policy decision + message
      sent) to the deals DB for the transcript view
  → stop conditions: accepted, rejected, priceFloor breached and no
    movement after 2 counters, or 6 total rounds — whichever first;
    on stop, mark deal status and surface to dashboard
```

Guardrails to hard-code, not leave to the LLM's judgment:
- Absolute price ceiling = `CompanyProfile.budgetInr` — the agent must never
  agree to anything above this, full stop, no LLM override.
- Absolute price floor for "this is suspiciously cheap, flag for human" —
  optional but a nice guardrail to mention if asked.
- Max 6 negotiation rounds per thread before forced escalation/stop.
- Only ever acts within a `threadId` it created via `send_email` — never
  starts new negotiation threads autonomously outside the initial outreach
  batch.

### 5.4 Landlord auto-responder (`landlordAutoResponder.ts`) — TEST ONLY

A separate small script/service that polls the *landlord* Gmail inbox and
auto-replies using a Claude call with a fixed persona prompt (budget floor,
negotiation flexibility, response style). This exists purely so the live
demo has something to negotiate against — **do not surface this as a product
feature or a "second AI agent"** in the UI, docs, or pitch. It's scaffolding,
same category as seed data.

---

## 6. Gmail OAuth setup — exact steps (do this before Day 2)

The Gmail API itself is free (generous daily quota, no billing needed for
this scale of use). Setup steps:

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create a
   new project (e.g. "roost-hackathon").
2. Enable the **Gmail API** for that project (APIs & Services → Library →
   search "Gmail API" → Enable).
3. Configure the **OAuth consent screen** (APIs & Services → OAuth consent
   screen): choose "External," fill in app name/email, add your own Gmail
   addresses as **test users** (this avoids needing Google's app review,
   which is not required for test-user mode).
4. Create **OAuth client ID** credentials (APIs & Services → Credentials →
   Create Credentials → OAuth client ID → Application type: "Desktop app").
   Download the client ID + secret.
5. Repeat test-user + credential steps for both the agent Gmail account and
   the landlord Gmail account (or reuse one OAuth client for both — simpler;
   just generate two separate refresh tokens, one per account). If reusing
   one client, add **both** Gmail addresses as test users in the consent
   screen (Section 6 step 3) — a client can have multiple test users.

   Also set the **Authorized redirect URI** on the OAuth client to:
   `http://localhost:3000/oauth2callback`
   Google removed the old "copy-paste code" (OOB) flow in 2022, so the
   script in step 6 below spins up a tiny local server to catch the
   redirect automatically — this redirect URI must match exactly or the
   flow will fail with a `redirect_uri_mismatch` error.

   Required scopes for this project:
   `https://www.googleapis.com/auth/gmail.send` and
   `https://www.googleapis.com/auth/gmail.readonly`
   (or just `https://www.googleapis.com/auth/gmail.modify`, which covers
   both send and read in one scope — simpler, use this unless you have a
   reason to keep scopes narrower).

6. **Get a refresh token per account.** Do this once per Gmail account (twice
   total: agent + landlord). Ask Claude Code to create this script for you —
   `packages/mcp-server/scripts/get-refresh-token.ts` — or use this as the
   reference implementation:

   ```ts
   // get-refresh-token.ts
   // Run with: npx tsx get-refresh-token.ts
   // Requires: npm install googleapis open express

   import { google } from "googleapis";
   import express from "express";
   import open from "open";

   const CLIENT_ID = process.env.OAUTH_CLIENT_ID!;
   const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET!;
   const REDIRECT_URI = "http://localhost:3000/oauth2callback";

   const oauth2Client = new google.auth.OAuth2(
     CLIENT_ID,
     CLIENT_SECRET,
     REDIRECT_URI
   );

   const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

   const authUrl = oauth2Client.generateAuthUrl({
     access_type: "offline",  // required to get a refresh_token back
     prompt: "consent",       // forces refresh_token even on repeat runs
     scope: SCOPES,
   });

   const app = express();

   app.get("/oauth2callback", async (req, res) => {
     const code = req.query.code as string;
     const { tokens } = await oauth2Client.getToken(code);
     console.log("\n=== SAVE THIS REFRESH TOKEN ===");
     console.log(tokens.refresh_token);
     console.log("================================\n");
     res.send("Done — refresh token printed in your terminal. You can close this tab.");
     process.exit(0);
   });

   app.listen(3000, () => {
     console.log("Opening browser for Google sign-in...");
     open(authUrl);
   });
   ```

   **How to run it, exactly:**

   a. Set `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` as env vars (or paste
      them directly into the script temporarily) — these come from the
      OAuth client you created in step 4.

   b. Run the script (`npx tsx get-refresh-token.ts`). It opens your default
      browser to a Google sign-in screen.

   c. **Log in with the agent Gmail account first.** Since the app is in
      "Testing" mode (not verified by Google), you'll hit an interstitial
      warning screen — click **"Advanced"**, then **"Go to [app name]
      (unsafe)"**. This is expected and safe; it only appears because the
      app isn't published/verified, which is fine and normal for a hackathon
      project. It will only let you past this screen if the account you're
      logging in with was added as a test user in step 3 — if you get a
      blocked-access error instead, go back and add that exact email as a
      test user first.

   d. Approve the requested Gmail permissions. Google redirects back to
      `http://localhost:3000/oauth2callback`, the script exchanges the code
      for tokens, and prints the **refresh token** to your terminal.

   e. Copy that refresh token into `.env` as `GMAIL_AGENT_REFRESH_TOKEN`.

   f. **Log out of that Gmail account in the browser** (or open an incognito
      window), then re-run the script and repeat b-e while logged in as the
      **landlord** Gmail account instead. Save that token as
      `GMAIL_LANDLORD_REFRESH_TOKEN`.

   **Common issues:**
   - `redirect_uri_mismatch` → the URI in the OAuth client settings
     (Cloud Console) doesn't exactly match `http://localhost:3000/oauth2callback`
     — they must be character-for-character identical, including the port.
   - `access_denied` / blocked screen with no "Advanced" option → the Gmail
     account you're using isn't in the test users list yet (step 3).
   - No `refresh_token` printed, only an access token → you forgot
     `access_type: "offline"` and/or `prompt: "consent"` in the script —
     Google only returns a refresh token on the first consent, or when
     `prompt: "consent"` forces it again.
   - Refresh token stops working later (`invalid_grant`) → test-mode refresh
     tokens can expire after 7 days of the app being unpublished/in testing
     if unused; if this happens mid-hackathon, just re-run the script to
     mint a new one — it takes under a minute.

No cost at any point in this setup for hackathon-scale usage.

---

## 7. Day-by-day build order

**Day 1**
- Repo scaffold (Section 2), seed data (Section 3), scoring engine
  (Section 4) — test via a CLI script, no server/UI yet.

**Day 2**
- Gmail OAuth setup (Section 6) for both accounts.
- `email_agent` MCP tool (Section 5.2).
- Negotiation state machine (Section 5.3) + landlord auto-responder
  (Section 5.4).
- Test the full headless loop: intake object → shortlist → outreach sent →
  auto-responder replies → agent parses/decides/responds → repeat until
  stop condition. This is the "it actually works, unsupervised" milestone.

**Day 3**
- Next.js dashboard: intake form, shortlist view (with score breakdown),
  negotiation transcript view (live-updating), savings summary.
- Record backup demo video.
- Final pitch rehearsal against the deck already built.

---

## 8. First message to send Claude Code

Once this file is in your project folder:

> Read BUILD_SPEC.md in full. Start on Day 1: scaffold the repo structure
> in Section 2, generate the seed listings and metro station data per
> Section 3 for Bengaluru, and implement the scoring engine per Section 4.
> Test it with a CLI script before moving on.
