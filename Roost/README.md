# Roost

AI agent that searches, scores, and shortlists office listings for a company,
then autonomously negotiates over email. Hackathon prototype — see
[BUILD_SPEC.md](./BUILD_SPEC.md) for the full spec.

## Status

**Day 1 done:** repo scaffold, seed data (80 Bengaluru listings across 20
neighborhoods, 12 real Namma Metro stations), and the scoring engine.

**Day 2 done:** Gmail OAuth wired for both accounts, `email_agent` MCP tool,
negotiation state machine + policy guardrails, test-only landlord
auto-responder, and full headless loop tested end-to-end over real Gmail.

**Architecture note — diverges from BUILD_SPEC.md Section 5.1/5.3/5.4:** by
explicit choice, there is no LLM and no API key anywhere in this project.
Intent classification is a Naive Bayes text classifier
(`packages/orchestrator/src/ml/intentModel.ts`) that keeps learning during
live use — every classification is checked against a cheap keyword oracle,
and the model is corrected (or reinforced) against it on the spot, with
state persisted to disk across runs. The in-range negotiation concession
size is a small online-learned linear model
(`packages/orchestrator/src/ml/concessionModel.ts`) that adjusts based on
whether past negotiations closed or stalled. The absolute price
ceiling/floor and round-cap guardrails in `policy.ts` are still fully
hard-coded and never influenced by either model — the learned pieces affect
*how* a message is read and *how much* to concede within an already-safe
range, never *whether* a guardrail holds.

## Layout

- `packages/mcp-server` — seed data, scoring engine, MCP tools (search/score/email)
- `packages/orchestrator` — negotiation state machine, policy, ML models, SQLite store
- `packages/web` — Next.js dashboard

## Running the negotiation loop

```bash
npm install
npm run gen:seed --workspace=packages/mcp-server        # regenerate seed listings (needs .env for real landlord email)
npm run demo --workspace=packages/orchestrator -- --fresh # intake -> shortlist -> outreach -> full negotiation loop
npm run score:cli --workspace=packages/mcp-server        # scoring engine only, no email
```

See `packages/mcp-server/src/mlCli.ts`'s sibling in orchestrator
(`packages/orchestrator/src/mlCli.ts`) and `policyCli.ts` for standalone
smoke tests of the ML models and guardrail logic, with no Gmail needed.

## Running the scoring engine

```bash
npm install
npm run gen:seed --workspace=packages/mcp-server   # regenerate seed listings
npm run score:cli --workspace=packages/mcp-server  # score + rank against a sample company profile
```

Pass a custom company profile JSON (see `CompanyProfile` in
`packages/mcp-server/src/types.ts`) as an argument:

```bash
npm run score:cli --workspace=packages/mcp-server -- ./my-profile.json
```
