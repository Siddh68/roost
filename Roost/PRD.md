# Product Requirements Document: Roost

**Status:** Draft — Prototype phase
**Owner:** [Your name]
**Last updated:** August 2026
**Related docs:** `BUILD_SPEC.md` (technical build spec), `roost-pitch-deck.pptx` (pitch)

---

## 1. Executive Summary

Roost is an AI agent that finds, scores, and negotiates office rental space
on behalf of a company — autonomously. Rather than a search-and-list tool,
it acts: it evaluates listings against a company's actual headcount and
constraints, reaches out to landlords, negotiates terms over email without
human approval per message, and keeps the company's dashboard current as
the deal develops.

Notably, the negotiation core runs on **two small, local, classical machine
learning models — not calls to an LLM API** — that start from a bootstrap
dataset and keep learning from every real message and every real
negotiation outcome, while hard financial guardrails (price ceiling,
floor, round limits) stay deterministic code the models can never
override. This gives the agent an inspectable, auditable decision process
with zero external API dependency and no per-call cost — see Section 7.1a
for the full architecture.

This PRD covers the **prototype** being built for a hackathon (3-day build
window, 7-day event) and frames it within the intended **production
roadmap** (voice calling, real broker data, a self-improving negotiation
model). The prototype's job is to prove the core mechanism — right-sizing
plus autonomous negotiation — end-to-end and honestly, not to be
feature-complete.

---

## 2. Problem Statement

Growing companies routinely overpay for office space because:

- **They default to wrong-sized space.** A 5-person team frequently ends up
  in an 8-seat office because that was the easiest option available, not
  because it was the right fit.
- **No one has time to shop properly.** Comparing rent, commute quality,
  and amenities across dozens of listings isn't anyone's actual job at a
  small/growing company, so teams settle for the first few options a
  broker surfaces.
- **Negotiation leverage goes unused.** Without market data or the
  bandwidth to push back, companies rarely negotiate hard enough on rate
  or terms.

The result is a recurring, avoidable monthly cost that compounds over the
life of a lease.

---

## 3. Goals

### 3.1 Product goals
- Prove that an AI agent can autonomously search, score, and negotiate
  office space on a company's behalf, with no human approving individual
  negotiation messages.
- Make the "why" of every recommendation visible — score breakdowns and
  negotiation reasoning shown, not a black box.
- Keep company users out of the loop for day-to-day negotiation mechanics,
  while giving them full visibility and an audit trail.

### 3.2 Business goals (for the pitch)
- Demonstrate a working, narrow, honest slice of the product live in a
  hackathon demo, distinguishing clearly between what's real/live and
  what's roadmap.
- Establish a credible path from prototype → production (voice calling,
  real broker data, self-improving negotiation) that a judge or investor
  can follow.

### 3.3 Non-goals (explicitly out of scope for this phase)
- Voice calling to clients or landlords (roadmap, not built this round).
- Live/real broker or listings-API data feeds (prototype uses seed data by
  design — see Section 9).
- A self-improving model that learns across many real deals (mechanism is
  described in the roadmap, not implemented at scale here).
- Payments, lease e-signature, or legal document generation.
- Mobile apps — web only for the prototype.

---

## 4. Target Users

| Persona | Description | Primary needs |
|---|---|---|
| **Company user** | Ops/finance/founder at a small-to-mid company (5-50 people) looking for office space | Fast, right-sized shortlist; visibility into negotiation without having to do it themselves; a defensible savings number |
| **Admin (internal)** | Roost operator, viewing usage across all company users | Aggregate view of active deals, negotiation outcomes, and system health |
| **Landlord** *(not a Roost user, a counterparty)* | Receives outreach and negotiates via email with the agent | Not a designed-for user in this phase — interactions with this persona are handled entirely by the agent |

---

## 5. Scope: Prototype vs. Production

| Capability | Prototype (this build) | Production (roadmap) |
|---|---|---|
| Listings data | Synthetic seed dataset | Real broker/dealer data (relationships already in place — see pitch deck, Slide 8) |
| Outreach & negotiation channel | Email (Gmail API), live and autonomous | Voice calling as the primary channel, for both client and landlord |
| Learning | None — static scoring weights | Self-improving negotiation model informed by real deal history |
| Auth | Google sign-in (NextAuth), company + admin roles | Same, plus likely SSO/enterprise options |
| Geographic scope | Single city (Bengaluru, seed data) | Multi-city |
| Users per account | Single saved search kept simple if time-constrained (see cut order) | Multiple saved searches, multiple properties/teams per org |

---

## 6. Functional Requirements

Organized by feature area. Priority follows MoSCoW, aligned with the cut
order already defined in `BUILD_SPEC.md` Section 9 — nothing here
contradicts that; this is the same plan expressed as requirements rather
than build steps.

### 6.1 Authentication & Roles — **Must have**
- FR-1: User can sign in with Google.
- FR-2: On first login, user is assigned role `COMPANY` unless their email
  is in the admin allowlist, in which case `ADMIN`.
- FR-3: Admin-only routes are inaccessible to `COMPANY`-role users
  (redirect, not just hidden UI).

### 6.2 Company Intake / Saved Search — **Must have**
- FR-4: User can create a company profile: team size, monthly budget,
  preferred area, must-haves (metro proximity, cab access, parking,
  furnished), and a negotiation price-floor percentage.
- FR-5 *(Should have — first cut if time-constrained)*: User can maintain
  multiple saved searches and switch between them.

### 6.3 Search & Scoring — **Must have**
- FR-6: System searches the seed listings dataset against a company
  profile's constraints.
- FR-7: Each listing receives a score (0-100) with a visible breakdown:
  cost efficiency, commute score, amenity fit.
- FR-8: Each scored listing includes a short natural-language reasoning
  string explaining the score.
- FR-9 *(Should have)*: Shortlist view supports filtering (budget range,
  floor, furnished) and sorting (score, rent, commute distance).

### 6.4 Autonomous Email Negotiation — **Must have, never cut**
- FR-10: Agent sends outreach emails to the top-ranked listings' landlord
  contacts via Gmail API.
- FR-11: Agent polls for replies on tracked threads without manual
  triggering.
- FR-12: Agent classifies each reply's intent (accept / counter-offer /
  reject / needs-info / off-topic).
- FR-13: Agent decides and sends its next message automatically, per the
  negotiation policy (Section 7.1), with **no human approval step per
  message**.
- FR-14: Every step (classification, decision, message sent) is logged to
  the negotiation transcript.
- FR-15: Negotiation stops on: acceptance, rejection, price floor breached
  with no further movement, or a hard round limit — whichever comes first.

### 6.5 Deal Dashboard — **Must have (transcript), Should have (history)**
- FR-16: User can view a live-updating negotiation transcript per deal,
  including agent reasoning at each step.
- FR-17: User sees a final savings number once a deal concludes.
- FR-18 *(Should have)*: User can view a history of past/current deals
  across their saved search(es).

### 6.6 Activity Feed — **Could have**
- FR-19: User sees a chronological feed of recent events (outreach sent,
  reply received, decision made) across their deals.

### 6.7 Admin View — **Could have, first cut if time-constrained**
- FR-20: Admin sees an aggregate list of all deals across all users, with
  status and outcome.

---

## 7. Key Business Logic

### 7.1 Negotiation policy (guardrails)
These are hard-coded rules, never left to model judgment or overridable by
either learned model in 7.1a:
- **Absolute price ceiling** = the company profile's budget. The agent must
  never agree to a deal above this, under any circumstance.
- **Price floor sanity check**: an offer below the profile's price-floor
  percentage of budget is treated as suspiciously cheap and gets a firm
  counter citing comparable listings — never an instant accept.
- **Max negotiation rounds**: 6 per thread (max 3 rounds of price
  movement), then forced escalation/stop.
- **Stall detection**: 2 consecutive rounds of no meaningful price movement
  forces a stop rather than negotiating indefinitely.
- **Thread scope**: the agent only acts within threads it initiated during
  the original outreach batch — it never starts new autonomous outreach
  outside that set.

### 7.1a Negotiation intelligence architecture
Reading a landlord's reply and deciding how much to concede is handled by
**two small classical ML models, running entirely locally** — no LLM, no
external API call, no per-message cost, anywhere in the negotiation path:

- A **Naive Bayes tone classifier**, bootstrap-trained on a hand-labeled
  dataset, predicting whether a reply reads as agreement, decline, a
  question, a statement, or off-topic. It keeps learning during live use:
  every classification is checked against a lightweight keyword oracle,
  and the model is corrected on the spot whenever they disagree.
- An **online-learned linear regression model** predicting what fraction
  of the remaining price gap to concede each round — replacing a fixed
  "always split the difference" rule with one that adapts based on whether
  past negotiations at similar points stalled or closed successfully.

Both models start from a neutral, non-learned baseline (the concession
model literally starts at a 50/50 split) and only diverge once they have
real evidence to diverge from. Every decision — the tone prediction, its
confidence, whether it was self-corrected, and the concession fraction
used — is logged and shown in the negotiation transcript, so the agent's
reasoning is inspectable rather than a black box. This also means the
financial guardrails in 7.1 are **never at risk of being reasoned around**
by a model — they're deterministic code the models cannot influence,
whereas an LLM-based approach would rely on prompting to hold that
boundary.

This architecture is why the negotiation loop has **zero external API
dependency**: no model API key exists anywhere in this build.

### 7.2 Scoring weights
- Cost efficiency: 45%
- Commute proximity to metro: 30%
- Amenity fit (parking, furnished, floor preference): 25%

(Full formula detail lives in `BUILD_SPEC.md` Section 4 — this PRD states
the weights for product-decision traceability, not the implementation.)

### 7.3 Test infrastructure vs. product surface
The demo's landlord-side auto-responder (used only so the live email
negotiation has something to react to) is **test infrastructure, not a
product feature**. It's a lightweight rule-based/templated script — not an
AI model of any kind — and must never be described as a "second AI agent"
or exposed in any user-facing surface. The product is one agent, acting on
behalf of the company; this keeps that true in the literal implementation,
not just the framing.

---

## 8. Non-Functional Requirements

- **Reliability of the demo loop**: the negotiation state machine must run
  headless and complete at least one full cycle (outreach → reply →
  decision → response → conclusion) before any frontend work begins — this
  is a go/no-go milestone, not a nice-to-have (see `BUILD_SPEC.md` Day 2).
- **Data honesty**: any illustrative numbers (e.g. savings percentages)
  shown in the product or pitch must be clearly labeled as based on seed
  data, not presented as market research.
- **Security**: OAuth credentials and refresh tokens are never committed to
  source control; `.env` is gitignored.
- **Latency**: email polling interval of 30-45 seconds is acceptable for
  demo purposes; no production-grade real-time requirement at this phase.

---

## 9. Data Sourcing

The prototype intentionally runs on synthetic seed data. A real dataset —
sourced from existing relationships with known brokers and property
dealers — exists and is reserved for the production build. Keeping the
prototype on seed data is a deliberate choice: it isolates and proves the
algorithm (scoring + negotiation logic) without depending on live data
pulls during a live demo. See pitch deck Slide 8 for the judge-facing
version of this framing.

---

## 10. Success Metrics

### 10.1 For the hackathon demo
- The full loop (intake → shortlist → live autonomous email negotiation →
  savings number) runs successfully, live, at least once, in front of
  judges.
- A backup recording exists in case the live run has an issue.
- Judges can articulate, after the demo, what's real/live vs. roadmap
  without needing it re-explained.

### 10.2 For a future production version (directional, not prototype targets)
- Reduction in average monthly rent per company relative to their
  first-choice/baseline listing.
- Number of deals closed per week without human intervention.
- Negotiation success rate (deals closed within budget vs. escalated to
  human).

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Live Gmail polling fails/rate-limits during the demo | Backup pre-recorded demo video; guardrail round-limits keep any single run bounded |
| Judges perceive the "landlord side" as a second product agent, undermining the "one agent" pitch | Explicit framing discipline (Section 7.3) — never surfaced in UI/docs/pitch |
| Scope creep from login/admin/feature additions displaces the negotiation loop, which is the actual differentiator | Pre-agreed cut order (`BUILD_SPEC.md` Section 9) decided in advance, not under deadline pressure |
| OAuth test-mode tokens expire after 7 days of inactivity | Known and documented in `BUILD_SPEC.md` Section 6; re-run the token script if it happens |
| Illustrative savings numbers mistaken for real market claims | Explicit "illustrative example" labeling in both product and pitch deck |

---

## 12. Assumptions & Dependencies

- **No model API dependency.** The negotiation core requires no external
  model API or key — see Section 7.1a. This removes what would otherwise
  be an external dependency and a per-call cost.
- Gmail API access via OAuth (free at hackathon scale — see `BUILD_SPEC.md`
  Section 6).
- Two Gmail accounts available for agent + landlord-side test
  infrastructure.
- Bengaluru as the default demo city (metro station coordinates seeded
  accordingly) — changeable if needed before Day 1 data generation.
- A hand-labeled bootstrap training set (60 examples) exists to seed the
  tone classifier before live use — this is a one-time authoring task, not
  ongoing data collection.

---

## 13. Milestones

| Day | Milestone |
|---|---|
| Day 1 | Repo scaffold, seed data, scoring engine (CLI-testable), Prisma schema migrated |
| Day 2 | Gmail OAuth live for both accounts; autonomous negotiation loop runs headless end-to-end — **go/no-go checkpoint** |
| Day 3 | Auth + frontend (intake, shortlist, transcript, and as many Should/Could features as time allows per the cut order); backup demo recording; pitch rehearsal |
| Days 4-7 | Hardening, polish, rehearsal, any stretch features |

---

## 14. Open Questions

- Final product name (currently "Roost," a placeholder — see prior naming
  discussion for alternatives).
- Whether to pursue Twilio-based calling as a Phase 2 build immediately
  after the hackathon, or prioritize real broker data integration first.
- Whether multi-city support is a near-term or longer-term roadmap item.
