# Roost — Completion Status

**Last verified:** 2026-08-24
**Against:** `BUILD_SPEC.md`, `PRD.md`

Every Must-have and Should-have requirement is implemented and has been
verified live (real Gmail sends/replies, real Postgres reads/writes, real
Supabase Auth sessions) — including every item on `BUILD_SPEC.md`'s
"cut if time-constrained" list. Nothing was cut.

---

## 1. Core negotiation loop — never-cut, verified end-to-end

| Item | Status | Evidence |
|---|---|---|
| Scoring engine (cost 45% / commute 30% / amenity 25%) | ✅ | Weights confirmed in `packages/mcp-server/src/scoring/scoreEngine.ts` |
| 80 seeded listings across Bengaluru | ✅ | `listings.seed.json`, 80 entries (spec asked for 60-80) |
| 12 real Namma Metro stations | ✅ | `metroStations.seed.json` (spec asked for 8-12) |
| Gmail OAuth (agent + landlord accounts) | ✅ | Both accounts live; refresh-token script at `packages/mcp-server/scripts/get-refresh-token.ts` |
| `email_agent` MCP tool (send / checkInbox / readThread) | ✅ | `packages/mcp-server/src/tools/emailAgent.ts` |
| Naive Bayes tone classifier, self-correcting against a keyword oracle | ✅ | `packages/orchestrator/src/ml/naiveBayesClassifier.ts` + `ruleBasedNlu.ts`; live run showed 100%-confidence classifications |
| Online linear-regression concession model | ✅ | `packages/orchestrator/src/ml/concessionModel.ts` |
| Hard-coded guardrails (ceiling/floor/round caps/stall detection) | ✅ | `packages/orchestrator/src/negotiation/policy.ts`, independent of both models |
| Landlord auto-responder — test-only, never surfaced as "AI agent" | ✅ | `landlordAutoResponder.ts`; grep for "landlord...agent" phrasing across the UI returns zero matches |
| Standalone ML smoke test | ✅ | `packages/orchestrator/src/mlCli.ts` |
| Zero `ANTHROPIC_API_KEY` / LLM dependency anywhere | ✅ | Repo-wide grep, zero matches |

**Live proof:** a full headless run (`npm run demo -- --fresh`) and a full
browser run both completed a real 3-listing negotiation against real Gmail
accounts, ending with deal status **Won** and a real savings number
(₹2,85,500/month across the three listings).

---

## 2. Authentication & roles

| Requirement | Status | Notes |
|---|---|---|
| FR-1 Google sign-in | ✅ | Migrated to **Supabase Auth** (see deviation below); tested live by you, works |
| FR-2 role assignment via `ADMIN_EMAILS` on first login | ✅ | `getOrCreateProfile()` in `store.ts` |
| FR-3 admin routes redirect/404 for non-admins | ✅ | Verified: `/admin` returns 404 for a non-admin test account |
| Email/password sign-up + sign-in | ✅ *(added beyond spec)* | Requested by you after the Google `redirect_uri_mismatch`; verified sign-up → email-confirm → sign-in → sign-out |

**Deviation from `BUILD_SPEC.md` Section 7:** the spec called for
NextAuth + Google-only, no password auth. You hit a redirect bug and asked
for Supabase Auth with both Google and email/password — this was a
deliberate, approved mid-build pivot, fully migrated and verified, not a
gap.

---

## 3. Company intake & search

| Requirement | Status |
|---|---|
| FR-4 Company profile intake (team size, budget, area, must-haves, price-floor %) | ✅ |
| FR-5 Multiple saved searches | ✅ *(this was the first item on the spec's cut list — built anyway)* |
| FR-6 Search seeded listings against profile | ✅ |
| FR-7 Score breakdown (cost/commute/amenity) shown per listing | ✅ |
| FR-8 Natural-language reasoning per score | ✅ |
| FR-9 Shortlist filters (budget, floor, furnished) + sort (score/rent/commute) | ✅ *(fourth item on the cut list — built anyway)* |

---

## 4. Deal dashboard

| Requirement | Status |
|---|---|
| FR-10 – FR-15 Autonomous outreach, polling, classification, response, transcript logging, stop conditions | ✅ all verified live |
| FR-16 Live negotiation transcript with reasoning at each step | ✅ |
| FR-17 Final savings number on deal close | ✅ |
| FR-18 Deal history across saved searches | ✅ *(third item on the cut list — built anyway)* |
| FR-19 Cross-deal activity feed | ✅ *(second item on the cut list — built anyway)* |
| FR-20 Admin aggregate view of all deals | ✅ *(the very first thing the spec said to cut — built anyway)* |

---

## 5. Infrastructure deviations (all deliberate, all approved)

- **Database**: local SQLite → Supabase-hosted Postgres, via Prisma. Prisma
  remains the sole app-data layer (no RLS policies needed).
- **`/admin/*` protection**: spec put the role check in
  `middleware.ts`; it's enforced at the page level instead
  (`role !== "ADMIN" → notFound()`), because Next.js Edge middleware can't
  reliably run Prisma. Functionally equivalent, verified working.
- **Prisma schema location**: `packages/orchestrator/prisma` instead of
  `packages/web/prisma`, so the standalone CLI (`npm run demo`) keeps
  working independently of the web app.
- **PgBouncer tuning**: `DATABASE_URL` needs both `pgbouncer=true` and
  `connection_limit=1` — discovered and fixed during verification; without
  the second flag, concurrent Next.js requests could intermittently throw
  `prepared statement does not exist`.

---

## 6. Non-functional requirements (PRD Section 8)

| Requirement | Status |
|---|---|
| Negotiation loop completes headlessly before frontend work | ✅ (Day 2 milestone met) |
| OAuth credentials never committed | ✅ `.env` gitignored, confirmed |
| Illustrative savings numbers not presented as market research | ✅ no such claims in the codebase |
| 30–45s email polling interval acceptable for demo | ✅ implemented as designed |

---

## What's left (not code — external/manual only)

Nothing outstanding on the build. Two things live outside the codebase:

1. **Backup demo recording** — `BUILD_SPEC.md` Day 3 asks for a pre-recorded
   fallback video in case live Gmail polling hiccups during judging. Not
   something I can produce — worth capturing a screen recording of one full
   run before the demo.
2. **Pitch rehearsal** — against `roost-pitch-deck.pptx`, referenced in the
   PRD but not part of this repo.
