# Roost — Build Spec for Claude Code

Read this fully before writing any code. This is the handoff spec for a 3-day
hackathon prototype: an AI agent that searches, scores, and shortlists office
listings for a company, then autonomously negotiates over email with zero
human approval per message.

Stack decision: **Node.js + TypeScript** throughout (orchestrator, MCP server,
frontend API routes). Frontend: Next.js + Tailwind + **NextAuth (Google
sign-in)** + **Prisma** (SQLite for local dev, easy to swap to Postgres
later).

**No LLM, no API key, anywhere in this project.** The negotiation
intelligence — reading landlord replies and deciding how much to concede —
runs on two small, fully local classical ML models (Naive Bayes + online
linear regression), not calls to Claude or any other model API. This is a
deliberate architecture decision — see Section 5 for the full design. There
is no `ANTHROPIC_API_KEY` anywhere in this build, including in the
landlord auto-responder test scaffolding.

**Scope note (read this before Day 1):** this spec covers the full version
— login, an admin view, saved searches, deal history, richer listings, and
an activity feed — alongside the negotiation loop. That is a lot for 2-3
days. Section 9 defines an explicit, pre-agreed cut order so that if time
runs short on Day 3, you already know exactly what to drop first without
having to make that call under pressure. Build in the order Section 8 lays
out — it's sequenced so that cutting from the end never breaks something
earlier.

---

## 1. What "done" looks like for the demo

A working end-to-end flow:

1. Company user **signs in with Google** (NextAuth). Admin users (you) see
   an extra admin view; company users don't.
2. User creates a **saved search** (a company profile — team size, budget,
   area, must-haves) — they can have several, tied to their account.
3. Agent searches seeded listings, scores them, shows a ranked shortlist
   with photos and richer filtering.
4. Agent sends real outreach emails (Gmail API) to the top 2-3 listings —
   email bodies are templated, not LLM-generated.
5. Agent polls the inbox, reads replies through a local ML classifier,
   decides a negotiation move via a local ML concession model, and
   responds automatically — no human approves any individual message, and
   no external model API is called at any point.
6. Dashboard shows the live negotiation transcript, reasoning at each step,
   and a final savings number once a deal is reached or a round limit hits.
7. User has a **deal history** page listing all past/current deals across
   their saved searches, and an **activity feed** of recent events.
8. Admin view shows the same, aggregated across all users.

Two Gmail accounts needed (see Section 6): one as "the agent," one as a
demo stand-in for "the landlord" (auto-responder — see Section 5.4). This is
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
│   │   │   ├── ml/
│   │   │   │   ├── naiveBayesClassifier.ts   # tone classifier, see 5.3.1
│   │   │   │   ├── trainingData.ts           # 60-example bootstrap set
│   │   │   │   ├── intentModel.ts            # classifier + oracle correction
│   │   │   │   └── concessionModel.ts        # online linear regressor
│   │   │   ├── negotiation/
│   │   │   │   ├── stateMachine.ts # poll → classify → decide → act → learn
│   │   │   │   ├── policy.ts       # price floor/ceiling, round limits
│   │   │   │   ├── ruleBasedNlu.ts # deterministic price regex + weak oracle
│   │   │   │   └── landlordAutoResponder.ts  # TEST ONLY, see 5.4 — local/scripted
│   │   │   ├── mlCli.ts            # standalone smoke test, no Gmail needed
│   │   │   └── db/
│   │   │       └── client.ts       # Prisma client singleton
│   │   ├── data/
│   │   │   ├── intentModel.json      # persisted classifier state (gitignored)
│   │   │   └── concessionModel.json  # persisted regressor state (gitignored)
│   │   └── package.json
│   └── web/                        # Next.js dashboard
│       ├── prisma/
│       │   └── schema.prisma       # see Section 3.3
│       ├── app/
│       │   ├── api/auth/[...nextauth]/route.ts
│       │   ├── login/page.tsx
│       │   ├── intake/page.tsx             # create a saved search
│       │   ├── searches/page.tsx           # list of saved searches
│       │   ├── shortlist/[dealId]/page.tsx
│       │   ├── negotiation/[dealId]/page.tsx
│       │   ├── history/page.tsx            # deal history across searches
│       │   ├── activity/page.tsx           # activity feed
│       │   └── admin/
│       │       ├── page.tsx                # admin overview
│       │       └── deals/page.tsx          # all deals, all users
│       ├── middleware.ts                   # protects /admin/* by role
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
  description: string;       // 1-2 sentence flavor text, for richer cards
  photoUrl: string;          // deterministic placeholder, e.g.
                              // `https://picsum.photos/seed/${id}/640/420`
  landlordEmail: string;     // route to the ONE demo landlord inbox for all
  landlordName: string;
  contactPersona?: string;   // optional flavor for auto-responder prompt
}
```

Base the demo city coordinates on a real city (ask the user which — default
to Bengaluru since that's their location) and geocode 8-12 real metro
stations for that city into `metroStations.seed.json`. This makes the
commute-score math real, not fabricated.

Listings stay static seed data (JSON file, not DB rows) — no need to move
these into Prisma, they're read-only reference data for the MCP server.

### 3.2 Frontend filters (shortlist page)

Beyond the must-haves already used for scoring, the shortlist view should
support client-side filtering/sorting on: budget range (slider), floor,
furnished toggle, and sort-by (best fit score / lowest rent / closest to
metro). This is UI-only filtering over the already-scored results — no new
backend logic needed beyond what Section 4 already returns.

### 3.3 Prisma schema (`packages/web/prisma/schema.prisma`)

This is the real, persistent data model — covers auth (via NextAuth's
Prisma adapter), saved searches, deals, and the negotiation transcript that
also powers the activity feed.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum Role {
  COMPANY
  ADMIN
}

model User {
  id             String           @id @default(cuid())
  email          String           @unique
  name           String?
  image          String?
  role           Role             @default(COMPANY)
  createdAt      DateTime         @default(now())
  accounts       Account[]
  sessions       Session[]
  companyProfiles CompanyProfile[]
}

// --- NextAuth standard models (Prisma adapter requires these as-is) ---
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
// --- end NextAuth models ---

// A "saved search" — one company's requirements. A user can have several.
model CompanyProfile {
  id            String   @id @default(cuid())
  userId        String
  label         String   // user-facing name, e.g. "Bengaluru HQ search"
  teamSize      Int
  budgetInr     Int
  preferredArea String
  mustHaves     String   // JSON-encoded string[] — SQLite has no native array type
  priceFloorPct Float
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  deals         Deal[]
}

enum DealStatus {
  SHORTLISTED
  NEGOTIATING
  WON
  LOST
}

model Deal {
  id               String         @id @default(cuid())
  companyProfileId String
  status           DealStatus     @default(SHORTLISTED)
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  companyProfile   CompanyProfile @relation(fields: [companyProfileId], references: [id], onDelete: Cascade)
  shortlistItems   ShortlistItem[]
  negotiations     Negotiation[]
}

model ShortlistItem {
  id          String @id @default(cuid())
  dealId      String
  listingId   String   // references listings.seed.json, not a DB relation
  totalScore  Float
  breakdown   String   // JSON-encoded ScoreResult["breakdown"]
  reasoning   String
  deal        Deal   @relation(fields: [dealId], references: [id], onDelete: Cascade)
}

enum NegotiationStatus {
  ACTIVE
  ACCEPTED
  REJECTED
  ESCALATED
}

model Negotiation {
  id             String            @id @default(cuid())
  dealId         String
  listingId      String
  threadId       String            // Gmail thread ID
  status         NegotiationStatus @default(ACTIVE)
  currentOfferInr Int?
  roundCount     Int               @default(0)
  deal           Deal              @relation(fields: [dealId], references: [id], onDelete: Cascade)
  events         NegotiationEvent[]
}

enum EventType {
  OUTREACH_SENT
  REPLY_RECEIVED
  INTENT_CLASSIFIED
  DECISION_MADE
  EMAIL_SENT
  DEAL_CLOSED
}

// One row per step in the negotiation loop. This table is what both the
// per-deal transcript view AND the cross-deal activity feed query from —
// no separate "activity" table needed, just filter/sort this by user.
model NegotiationEvent {
  id            String       @id @default(cuid())
  negotiationId String
  type          EventType
  payload       String       // JSON-encoded — message body, classification, etc.
  createdAt     DateTime     @default(now())
  negotiation   Negotiation  @relation(fields: [negotiationId], references: [id], onDelete: Cascade)
}
```

**Admin role assignment:** no separate admin UI for granting roles needed
for a prototype. In the NextAuth `signIn` callback, check the signed-in
email against a comma-separated `ADMIN_EMAILS` env var and set
`role: ADMIN` on first login. Simple, no extra screens.

**Activity feed query pattern:** for a company user, `NegotiationEvent`
rows joined up through `Negotiation → Deal → CompanyProfile → User`,
filtered to `userId = session.user.id`, ordered by `createdAt desc`. For
admin, the same query with no `userId` filter.

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
```

No model API key of any kind belongs in this file. If you find yourself
about to add `ANTHROPIC_API_KEY` or similar back in, that's a sign
something has drifted from the architecture in Section 5.3 — stop and
check against this spec first.

### 5.2 `email_agent` MCP tool

Three actions:

- `send_email({ to, subject, body, threadId? })` — sends via Gmail API,
  returns the Gmail thread ID.
- `check_inbox({ sinceTimestamp })` — lists new messages in tracked threads.
- `read_thread({ threadId })` — full thread content for context.

Used by both the agent's own send/poll loop and, separately, by the
landlord auto-responder (Section 5.4) to poll and reply on the landlord
side.

### 5.3 Negotiation intelligence — two local ML models, no external calls

Intent classification and concession sizing are handled entirely by two
small classical ML models running locally in the orchestrator — no API
key, no external network call, no per-message cost. Chosen deliberately
over a neural network or an LLM call: both train/update in milliseconds
with no GPU, are fully inspectable (print the exact word/class probability
table or the regression weights), and are realistic to get right within a
hackathon timeline with the small number of real examples this project
will actually see.

#### 5.3.1 Model 1 — the tone classifier (`naiveBayesClassifier.ts`)

**Type:** Multinomial Naive Bayes, bag-of-words, Laplace (add-one)
smoothing.

**What it predicts:** the *tone* of a landlord's reply — one of 5 classes:
`agreement | decline | question | statement | off_topic`. It does not
predict the final negotiation intent directly: distinguishing "accept" from
"counter_offer" mostly comes down to comparing a mentioned price against
the company's last offer, a numeric fact, not something worth training a
model on. `intentModel.ts` folds the extracted price back in on top of the
predicted tone:

- tone = decline → intent = `reject`
- a price was mentioned → intent = `accept` if tone is agreement *or* the
  price is within 1% of the last offer, else `counter_offer`
- no price, tone = agreement → `accept`
- no price, tone = question → `needs_info`
- otherwise → `off_topic`

**Bootstrap training set** (`trainingData.ts`): 60 hand-written examples,
12 per class, covering realistic landlord phrasing. Seeds a reasonable
prior before the model ever sees a real message.

**Learning during live use:** every live classification is cross-checked
against `heuristicToneLabel()` in `ruleBasedNlu.ts` — a narrow, deliberately
conservative keyword/regex oracle (explicit accept/decline phrases, a
question mark, or an extractable price) that only returns an opinion when
confident, and stays silent otherwise. If the oracle disagrees with the
model, that's a caught mistake: retrain on the spot using the oracle's
label as ground truth. If they agree, retrain on the model's own
prediction anyway — reinforcing confident correct behavior. Either way,
every real classification becomes a new training example and the updated
state is persisted to `data/intentModel.json` immediately.

Surface the correction in the UI: when a live classification disagrees
with the oracle and gets corrected, log it as its own negotiation event
with `corrected: true` and both labels shown. This is a strong, honest demo
visual — the model catching and fixing its own mistake mid-negotiation,
reasoning fully visible, rather than hidden inside an opaque API call.

#### 5.3.2 Model 2 — the concession-sizing model (`concessionModel.ts`)

**Type:** single-layer linear regression with a sigmoid squash,
`sigmoid(w·x + b)`, output in `(0,1)`. Updated by plain online gradient
descent, no library.

**What it predicts:** what *fraction* of the remaining price gap to
concede this round — replacing a fixed "always split the difference 50/50"
rule with something that can drift based on what's actually worked before.

**Features (2):**
1. `priceMovementRoundsNorm` — how far into the concession ladder (max 3
   rounds of price movement) this thread already is.
2. `gapRatio` — the remaining gap between the two offers, scaled against
   the company's whole acceptable price range (ceiling − floor).

**Cold start:** weights and bias initialize at zero, so
`sigmoid(0) = 0.5` — a neutral 50/50 split, identical to a plain fixed
rule. The model only diverges from that once it has real evidence to
diverge from — don't fake a "trained" starting point.

**Learning during live use:** remember the fraction actually used on the
most recent in-range counter for a thread. When that thread reaches a
terminal state:
- **Stalled** (hit the round cap, or the stall guardrail in 5.3.3 fires) →
  update the model to push the fraction *up* for similar situations next
  time — being conservative didn't close the deal, so concede faster in
  comparable spots going forward.
- **Closed successfully** → a smaller reinforcing update toward the
  fraction that worked.

Run a handful of repeated gradient steps per real outcome, not one
microscopic nudge — this system will see a handful of real negotiations
per deployment, not millions of examples, so one real event needs to
visibly move the needle. Persist state to `data/concessionModel.json`
after every update.

#### 5.3.3 The state machine (`stateMachine.ts`)

```
poll (every 30-45s in demo mode)
  → new message in a tracked thread?
    → extractPriceInr()             deterministic regex — not learned
    → NaiveBayesClassifier.predict() → tone label + confidence
    → heuristicToneLabel() oracle   → check the model, correct if needed
                                       (5.3.1) — always retrain either way
    → combine tone + price → final intent (accept / counter_offer /
      reject / needs_info / off_topic)
    → apply policy (policy.ts) — hard-coded, see 5.3.4:
        - counter_offer within [priceFloor, ceiling] →
            ConcessionModel.predict() → fraction →
            counterPrice = clamp(current + fraction × gap, floor, ceiling)
        - counter_offer below priceFloor → firm counter citing comparable
          listings from the seed data — never an instant accept, even if
          tone reads as agreement
        - needs_info → answer directly using listing + company profile
          context already available (templated, not LLM-generated)
        - reject → log as closed-lost, remove from shortlist
    → generate the actual email body from a template (no LLM call)
    → send_email via MCP tool
    → log every step (tone prediction, correction if any, policy decision,
      concession fraction, message sent) to the deals DB for the
      transcript view
  → on terminal state (accepted / rejected / stalled) →
      ConcessionModel.update() with the outcome (5.3.2)
  → stop conditions: accepted, rejected, price floor breached with no
    movement after 2 counters (stall detection), or 6 total rounds —
    whichever comes first
```

#### 5.3.4 Guardrails — hard-coded, never learned (`policy.ts`)

Both models influence *how* the agent reads a message and *how much* it
concedes — **never whether a safety boundary holds.** `policy.ts` is a
pure, deterministic module, independently unit-tested:

- **Absolute price ceiling** = `CompanyProfile.budgetInr`. The agent can
  never agree to anything above this, full stop, regardless of any model
  output.
- **Price floor sanity check.** An offer below `priceFloorPct` of budget is
  treated as suspiciously cheap and gets a firm counter citing comparable
  listings — never an instant accept, even if the tone model reads
  agreement.
- **Round caps.** Max 6 total rounds per thread, max 3 rounds of ladder
  price movement, whichever comes first.
- **Stall detection.** 2 consecutive rounds of the landlord holding above
  budget with no meaningful movement (< 2% price change) forces a stop and
  escalation rather than negotiating forever.
- **Thread scope.** The agent only ever acts within a `threadId` it
  created via the initial outreach batch — it never starts new negotiation
  threads autonomously.

Whatever fraction `ConcessionModel.predict()` returns is always clamped
into `[floor, ceiling]` before it becomes a real counter-offer. The models
can shift the negotiation's *pacing*; they cannot shift its financial
limits.

### 5.4 Landlord auto-responder (`landlordAutoResponder.ts`) — TEST ONLY, local/scripted

A separate small script/service that polls the *landlord* Gmail inbox and
auto-replies. Like the rest of this project, **it does not call an LLM** —
it's a lightweight rule-based/templated responder with a configurable
persona (a budget floor, a flexibility setting, and a small set of reply
templates keyed to the incoming offer relative to that floor). This exists
purely so the live demo has something to negotiate against — **do not
surface this as a product feature or a "second AI agent"** in the UI,
docs, or pitch. It's scaffolding, same category as seed data, and now
consistent with the rest of the project in having zero external
dependencies.

### 5.5 Standalone smoke test (`mlCli.ts`)

A CLI script that exercises both models directly — feed it a handful of
sample landlord messages and simulated negotiation outcomes, print the
classifier's predictions/corrections and the concession model's fraction
before and after updates. This is how you verify the ML core works
*before* wiring it into the live Gmail loop — run this on Day 2 before
attempting the full headless end-to-end test.

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

## 7. Authentication & roles

- **Provider:** NextAuth (Auth.js) with Google as the sole sign-in provider
  — reuses the same OAuth client/consent-screen setup you're already doing
  for Gmail in Section 6 (add `http://localhost:3000/api/auth/callback/google`
  as an additional authorized redirect URI on that same OAuth client, or
  create a second client if you'd rather keep concerns separated — either
  works, one client is simpler).
- **Adapter:** `@next-auth/prisma-adapter`, pointed at the schema in
  Section 3.3 — this gives you working login with almost no custom code.
- **Role assignment:** see the note at the end of Section 3.3 — env var
  based, no admin-granting UI needed.
- **Route protection:** `packages/web/middleware.ts` checks the session on
  any `/admin/*` route and redirects non-admins to `/searches` (their normal
  dashboard). Everything else just requires *any* signed-in session —
  redirect to `/login` if there isn't one.
- **New env vars needed:**
  ```
  NEXTAUTH_URL=http://localhost:3000
  NEXTAUTH_SECRET=            # generate with: openssl rand -base64 32
  GOOGLE_CLIENT_ID=           # can reuse the Gmail OAuth client's ID
  GOOGLE_CLIENT_SECRET=
  DATABASE_URL="file:./dev.db"
  ADMIN_EMAILS=you@example.com   # comma-separated
  ```

Don't build password-based auth, email verification flows, or
password-reset — none of that is needed and all of it burns time for zero
demo value. Google sign-in via NextAuth is the entire auth surface.

---

## 8. Day-by-day build order

**Day 1**
- Repo scaffold (Section 2), seed data + richer listing fields (Section 3.1),
  scoring engine (Section 4) — test via a CLI script, no server/UI yet.
- Prisma schema (Section 3.3) written and migrated (`npx prisma migrate dev`)
  — get the database shape right early since everything else depends on it.

**Day 2**
- Gmail OAuth setup (Section 6) for both accounts.
- `email_agent` MCP tool (Section 5.2).
- Both ML models (Section 5.3.1, 5.3.2) built and bootstrap-trained; verify
  with the standalone smoke test (Section 5.5, `mlCli.ts`) before touching
  Gmail at all — confirm the classifier's predictions/corrections and the
  concession model's fraction shifts look sane on sample data first.
- Negotiation state machine (Section 5.3.3) + landlord auto-responder
  (Section 5.4) — writing real rows to `Negotiation` / `NegotiationEvent`
  as it runs, not just logging to console.
- Test the full headless loop: intake object → shortlist → outreach sent →
  auto-responder replies → agent classifies/decides/responds/learns →
  repeat until stop condition. This is the "it actually works, unsupervised,
  and genuinely learning" milestone. **This is the non-negotiable core —
  do not start Day 3 frontend work until this loop runs cleanly end-to-end
  at least once.**

**Day 3**
- NextAuth + Google login (Section 7) wired up first — everything else in
  the frontend sits behind it.
- Intake/saved-search page, shortlist page (with photos + filters from
  Section 3.2), negotiation transcript page.
- Deal history page, activity feed, admin overview — build in that order;
  see Section 9 for what to skip first if time runs out.
- Record backup demo video.
- Final pitch rehearsal against the deck already built.

---

## 9. If time runs short — cut in this exact order

Decided now, not on Day 3, so there's no debate under pressure. Cut from
the top of this list first; everything below a cut line still works fine
without it:

1. **Admin view** (`/admin/*`) — cut first. A judge asking "does this scale
   to multiple companies" can be answered verbally; you don't need to
   demo it live.
2. **Activity feed** — cut second. The negotiation transcript (per-deal)
   already shows this same event data; the cross-deal feed is a nice-to-have
   aggregation, not new information.
3. **Deal history page** — cut third. If only one deal exists in the demo
   run anyway, this page has nothing extra to show.
4. **Richer listing filters** (budget slider, sort options) — cut fourth.
   Keep the photo + description on cards (cheap, high visual value) but the
   filter UI itself can go if needed.
5. **Multiple saved searches per user** — cut fifth, meaning: still let a
   user create a search, just don't build the "list of past searches" UI —
   one active search at a time is fine for a demo.

**Never cut, no matter what:** Google login itself (it's the thing that was
explicitly asked for and is cheap via NextAuth), the scoring engine, and
the autonomous negotiation loop (Section 5) — that last one is the core of
the entire pitch.

---

## 10. First message to send Claude Code

Once this file is in your project folder:

> Read BUILD_SPEC.md in full. Start on Day 1: scaffold the repo structure
> in Section 2, generate the seed listings and metro station data per
> Section 3.1 for Bengaluru, implement the scoring engine per Section 4,
> and set up the Prisma schema per Section 3.3 (run the initial migration).
> Test the scoring engine with a CLI script before moving on.
