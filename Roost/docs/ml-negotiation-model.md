# Roost's Learning-Based Negotiation Core

Reference doc for updating the PRD, BUILD_SPEC.md, and the pitch deck.
Describes what actually got built in place of the LLM-based approach
BUILD_SPEC.md originally called for — a deliberate, explicit decision to run
the negotiation intelligence with **zero API keys and zero external calls**.

---

## 1. One-paragraph summary (for a PRD / slide)

Roost's negotiating agent doesn't call an LLM to decide how to read a
landlord's reply or how much to concede. It uses two small, fully local
machine-learning models — a Naive Bayes text classifier and an online
linear regressor — that start from a hand-labeled bootstrap dataset and then
**keep learning from every real message and every real negotiation outcome**
for the life of the deployment. Every classification is checked against a
cheap heuristic oracle and the model corrects itself on the spot when
they disagree; every negotiation that stalls or closes feeds an online
gradient update that measurably shifts future behavior. The hard financial
guardrails — price ceiling, price floor, round caps — are never learned;
they're deterministic code the models cannot override. This gets you a
genuinely adaptive agent with an auditable, inspectable decision process,
no per-call cost, no external dependency, and no risk of a model
hallucinating its way past a safety boundary.

---

## 2. Why this replaced the LLM approach

BUILD_SPEC.md originally called for Claude API calls to (a) classify the
landlord's intent and (b) write the negotiation emails. Two explicit product
decisions changed that, in order:

1. **No LLM, no API key, anywhere in the project.** Classification became
   keyword/regex-based and email bodies became templated.
2. **Not rule-based — learning-based.** The rule-based version worked but
   was static: it could never get better, and "the agent learns" wasn't
   actually true of it. It was replaced with two small classical ML models
   that are trained on a seed dataset and then **continue learning during
   live use**, with a defined mechanism for what "learning from its
   mistakes" concretely means (see §4 and §5).

Classical ML (Naive Bayes + linear regression) was chosen over a neural
network because it trains and updates in milliseconds with no GPU, is
completely inspectable (you can print the exact word/class probability
table or the regression weights), and is realistic to get right and keep
stable within a hackathon timeline — a neural net would need far more
training data to not be flaky live.

---

## 3. Architecture overview

```
Landlord email arrives
        │
        ▼
extractPriceInr()              deterministic regex parse — not learned;
        │                      comparing two numbers isn't an ML problem
        ▼
NaiveBayesClassifier.predict() ── learned: predicts a TONE label
        │                          (agreement / decline / question /
        │                          statement / off_topic) + confidence
        ▼
heuristicToneLabel() oracle    cheap keyword regex, used ONLY to check
        │                      the model — never the primary classifier
        ▼
   agree? ─ no → correct the model (train on oracle's label) ─┐
        │                                                      │
       yes → reinforce the model (train on its own prediction) │
        │◄─────────────────────────────────────────────────────┘
        ▼
tone + price combined deterministically → final intent
  (accept / counter_offer / reject / needs_info / off_topic)
        │
        ▼
policy.ts guardrails (hard-coded, never learned)
  - price ceiling = company budget           → never exceeded
  - price floor sanity check                 → "too cheap" gets a firm
                                                counter, not an instant accept
  - max 6 total rounds / 3 price-movement rounds
  - 2-round no-movement stall detection
        │
        ▼ (only on an in-range counter)
ConcessionModel.predict()      learned: what FRACTION of the remaining
        │                      gap to concede this round
        ▼
counterPrice = clamp(current + fraction × gap, floor, ceiling)
        │
        ▼
templated email generated & sent
        │
        ▼ (only when the thread later reaches a terminal state)
ConcessionModel.update()       learned: stalled → push fraction up next
                                time in similar situations; closed →
                                reinforce the fraction that worked
```

Both models persist their state to disk (`intentModel.json`,
`concessionModel.json`) and reload it on the next run — they don't reset
between negotiations, deploys, or restarts. Knowledge accumulates.

---

## 4. Model 1 — the intent/tone classifier

**Type:** Multinomial Naive Bayes, bag-of-words, Laplace (add-one) smoothing.
**File:** `packages/orchestrator/src/ml/naiveBayesClassifier.ts`

**What it predicts:** not the final negotiation intent directly — it
predicts the *tone* of the message, one of 5 classes:
`agreement | decline | question | statement | off_topic`.

**Why tone, not intent directly:** disambiguating "accept" from
"counter_offer" mostly comes down to comparing a mentioned price against the
company's last offer — a numeric fact, not something worth training a model
on. The genuinely learnable part is reading how the message *sounds*. A
small deterministic step then folds the extracted price back in:

- tone = decline → intent = reject
- a price was mentioned → intent = accept if tone is agreement *or* the
  price is within 1% of our last offer, else counter_offer
- no price, tone = agreement → accept
- no price, tone = question → needs_info
- otherwise → off_topic

**Bootstrap training set:** 60 hand-written examples, 12 per class,
covering realistic landlord phrasing (`trainingData.ts`). This seeds the
model with a reasonable prior before it ever sees a real message.

**"Learning from its mistakes," concretely:** every live classification is
cross-checked against `heuristicToneLabel()` — a cheap, deliberately narrow
keyword/regex function (checks for explicit accept/decline phrases, a
question mark, or an extractable price) that only returns an opinion when
it's confident, and returns nothing otherwise. If the oracle disagrees with
the model's prediction, that's treated as a caught mistake: the model is
retrained on the spot using the oracle's label as ground truth. If they
agree, the model is still retrained on its own prediction — reinforcing
confident correct behavior, so it keeps learning during use either way.
Every classification, right or wrong, becomes a new training example, and
the state is saved to disk immediately.

**Observed in a live test run** (real Gmail, real landlord auto-responder):
a landlord reply was initially read by the model as "agreement" tone; the
oracle flagged it as "question" instead (it contained a price *and* a
trailing question); the system logged the correction and the final intent
was still derived correctly (`counter_offer`, since the price comparison
overrides tone when a number is present). This correction is visible
directly in the negotiation transcript UI (`corrected: true`, both labels
shown) — a strong, honest demo visual: you can *watch* the model catch and
fix its own mistake mid-negotiation, with the reasoning laid bare rather
than hidden inside an LLM call.

---

## 5. Model 2 — the concession-sizing model

**Type:** single-layer linear regression with a sigmoid squash
(`sigmoid(w·x + b)`, output in (0,1)), updated by plain online gradient
descent (no library).
**File:** `packages/orchestrator/src/ml/concessionModel.ts`

**What it replaces:** the original fixed "split the difference 50/50"
negotiation-ladder rule. Instead of always meeting the landlord exactly
halfway, the model predicts *what fraction* of the remaining price gap to
concede, and that fraction can drift based on what's actually worked before.

**Features (2):**
1. `priceMovementRoundsNorm` — how far into the 3-round concession ladder
   this thread already is.
2. `gapRatio` — the remaining gap between our offer and theirs, scaled
   against the company's whole acceptable price range (ceiling − floor).

**Cold start:** weights and bias initialize at zero, so
`sigmoid(0) = 0.5` — a neutral 50/50 split, identical to the original fixed
rule. The model starts exactly where the non-learning version did and only
diverges once it has real evidence to diverge from.

**"Learning from its mistakes," concretely:** the fraction actually used on
the most recent in-range counter for a thread is remembered. When that
thread later reaches a terminal state:
- **Stalled** (hit the round cap, or the no-movement stall guardrail fired)
  → the model receives an update pushing the fraction *up* for similar
  situations next time — i.e., "being this conservative didn't close the
  deal, concede faster in comparable spots going forward."
- **Closed successfully** → a smaller reinforcing update toward the
  fraction that got there.

Each real outcome triggers a handful of repeated gradient steps (not a
single microscopic nudge) — appropriate for a system that will see a
handful of real negotiations per deployment, not millions of training
examples, so one real event needs to visibly move the needle.

**Observed in testing:** cold start `0.500` → after one simulated stall
`0.537` → after a second stall `0.574`, at the same feature point — a clear,
monotonic, fully explainable behavior shift from real outcomes. An
untouched feature point stayed near `0.500` in the same test, showing the
model generalizes locally rather than shifting globally on one data point.

---

## 6. What stays hard-coded, never learned (the guardrails)

Both models influence *how* the agent reads a message and *how much* it
concedes — never *whether* a safety boundary holds. This is enforced in
`packages/orchestrator/src/negotiation/policy.ts`, a pure, deterministic,
independently unit-tested module:

- **Absolute price ceiling** = the company's budget. The agent can never
  agree to anything above this, full stop, regardless of any model output.
- **Price floor sanity check.** An offer below 85% (configurable) of budget
  is treated as suspiciously cheap and gets a firm counter citing comparable
  listings — never an instant accept, even if the tone model reads it as
  agreement.
- **Round caps.** Max 6 total rounds per thread, max 3 rounds of ladder
  price movement, whichever comes first.
- **Stall detection.** 2 consecutive rounds of the landlord holding above
  budget with no meaningful movement (< 2% price change) forces a stop and
  escalation rather than negotiating forever.

Whatever fraction the concession model predicts is always clamped into
`[floor, ceiling]` before it becomes a real counter-offer — the model can
shift the negotiation's *pacing*, never its financial limits.

---

## 7. Slide-ready bullets

- **No LLM. No API key. Fully local, zero per-call cost.**
- Two classical ML models — a Naive Bayes tone classifier and an online
  linear regressor — replace what would otherwise be an LLM call.
- **Genuinely learns during use**, not just at training time: every
  classification is checked against a cheap oracle and corrected on
  disagreement; every negotiation outcome (stall vs. close) feeds an online
  update to how aggressively the agent concedes next time.
- **Explainable, not a black box.** Every decision shows its tone
  prediction, confidence, and whether it was self-corrected, right in the
  live transcript.
- **Hard financial guardrails are code, not model output** — the agent
  cannot be talked, tricked, or "hallucinated" past the budget ceiling.
- Demonstrated live: a model self-correction caught mid-negotiation, and a
  concession-fraction shift (0.500 → 0.574) after two simulated stalls.

---

## 8. Suggested BUILD_SPEC.md diff language

Replace Section 5.1 / 5.3 / 5.4's Claude-API framing with:

> Intent classification and concession sizing are handled by two small
> classical ML models running entirely locally (no API key, no external
> calls): a Naive Bayes tone classifier
> (`packages/orchestrator/src/ml/intentModel.ts`) and an online-learned
> linear concession model (`packages/orchestrator/src/ml/concessionModel.ts`).
> Both are bootstrap-trained on a seed dataset and continue learning during
> live use — the classifier self-corrects against a keyword oracle on every
> message, and the concession model updates from real stall/close outcomes.
> The price ceiling, price floor, and round-cap guardrails remain fully
> hard-coded in `policy.ts` and are never influenced by either model.

---

## 9. File map

| File | Role |
|---|---|
| `packages/orchestrator/src/ml/naiveBayesClassifier.ts` | The Naive Bayes model itself — train/predict/persist |
| `packages/orchestrator/src/ml/trainingData.ts` | 60-example bootstrap dataset (5 tone classes) |
| `packages/orchestrator/src/ml/intentModel.ts` | Wraps the classifier + oracle-based online correction; produces final intent |
| `packages/orchestrator/src/ml/concessionModel.ts` | Online linear regressor for concession fraction |
| `packages/orchestrator/src/negotiation/ruleBasedNlu.ts` | Deterministic price regex + the weak oracle (not a classifier) |
| `packages/orchestrator/src/negotiation/policy.ts` | Hard-coded guardrails; consumes the learned concession fraction as one input |
| `packages/orchestrator/src/negotiation/stateMachine.ts` | Wires it all together: poll → classify → decide → act → learn from outcome |
| `packages/orchestrator/src/mlCli.ts` | Standalone demo/smoke test of both models, no Gmail needed |
| `packages/orchestrator/data/intentModel.json`, `concessionModel.json` | Persisted, accumulating model state (gitignored) |
