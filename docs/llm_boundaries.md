# Aestus — LLM Safety Boundaries

How the LLM is constrained, and why. This is the binding reference for anyone
touching `services/llm` (P13) or any future LLM use. It operationalizes hard
rules #1, #2, #3, #4, #7 from `CLAUDE.md` and principles #1, #4, #5 from
`docs/principles.md`. If you are about to let the model do something not allowed
here, stop — change this document first, with an explicit decision, or don't do it.

The one-line version: **the LLM is a narrative layer. It explains; it never
decides numbers and never commands.**

---

## 1. Narrative-only reasoning

The model produces a **draft** — stance, thesis, factors, and three reasoning
strings (`invalidation_reasoning`, `confidence_reasoning`, `recheck_condition`) —
plus a confidence and a timeframe. Nothing else.

- The draft schema (`services/llm/src/draft.ts`, `BriefingDraft`) has **no price
  fields**. The model literally cannot emit an entry, invalidation, target, or
  size — there is no slot for it. This is the first and strongest line of defense:
  a structural one, not a prompt plea.
- Malformed model output is repaired where safe (clamped confidence, defaulted
  narrative) or rejected outright when an essential field (stance/thesis) is
  unusable — see `parseBriefingDraft`. The service never trusts raw model text.

## 2. Deterministic numbers (the LLM narrates, never invents)

Every price level on a briefing — entry zone, invalidation, targets, size — is
**copied verbatim** from the context packet's `deterministic_levels`, which come
from the P12 level engine (ATR, swing structure, liquidation clusters, volume
nodes). See `services/llm/src/generate.ts`: the assembled `Briefing` takes its
numbers from `packet.deterministic_levels`, not from the model. For `no_trade`
the level fields are `null`.

In the prompt (`services/llm/src/prompt.ts`):

- The deterministic levels are stated explicitly, and an **enumerated allow-list**
  of the only prices the model may reference is injected (`allowedPrices`), with
  a hard instruction: never invent, round, average, or interpolate a price
  outside that list.
- A machine-readable `<packet_facts>` block carries the same numbers; the
  deterministic fake provider parses it so fixture-first output stays
  packet-consistent.

Defense in depth, in order: (1) no price fields in the draft schema → (2) prompt
allow-list + no-invention clause → (3) numbers copied from the engine in
assembly → (4) post-generation validation (below).

## 3. No execution — proposals, never commands

Aestus never places orders, holds trading API keys, or runs position logic
(hard rule #1). A briefing is a **proposal with reasoning**, including the
no-trade proposal — never an instruction.

- `services/llm/src/validate.ts` (`validateBriefing`) runs after generation and
  **rejects** any briefing whose narrative contains execution/order/position/
  leverage language (`findExecutionLanguage`). A rejected briefing is **not
  stored and not published**, so it never reaches the user
  (`services/llm/src/service.ts`).
- Validation also enforces: valid stance, confidence in `[0,1]`, non-empty
  thesis, and — for any directional (long/short) idea — a present invalidation
  and entry zone. A directional proposal with no stop is unsafe by construction
  and is dropped.
- No-trade is first-class: it needs reasons (in `factors`) and a
  `recheck_condition`, and requires no entry/targets.

## 4. Cost controls (stay inside €10–30/month)

Hard rule #7 — cost stays visible and bounded.

- **Flat-rate provider.** Runtime inference is Ollama Cloud (subscription
  billing), so marginal `cost_usd` is 0; the provider abstraction still carries a
  per-token cost field so a metered provider needs no code change
  (`services/llm/src/provider/`).
- **Model routing by task tier.** Strong model (Kimi K2.6) for briefings/
  research; cheap model (MiniMax M3) for extraction/scoring/classification.
  Configurable per task kind via the `model_routing` table / `LLM_MODEL_ROUTING`
  env (`services/llm/src/routing.ts`).
- **Cooldown cache.** Duplicate anomalies whose material signature is unchanged
  within a cooldown are skipped entirely — no LLM call, no spend
  (`services/llm/src/cache.ts`). A material context change (levels, no-trade
  flag, quality band, anomaly type) busts the cache and regenerates.
- **Visible spend.** Every briefing stores `cost_metadata` (provider, model,
  prompt/completion/total tokens, USD) and a `cache_hit` flag; the service
  exports `llm_*_total` Prometheus counters including tokens and USD
  (`services/llm/src/health.ts`).

## 5. Data freshness warnings

The model must hedge on weak or stale context, never paper over it.

- The packet carries deterministic `quality` (score, label, `degraded_feeds`)
  and per-feed `source_freshness` (P11). The prompt states packet quality
  **explicitly** and instructs the model to calibrate confidence to it and to
  prefer `no_trade` when context is degraded or stale.
- The deterministic fake lowers confidence as quality drops, so the
  fixture-first path exhibits the same behavior.
- Surfacing stale/degraded state to the user (badges, callouts) is the UI's job
  (presentation spec); the briefing and packet carry the data for it.

---

## Where the boundaries live (don't route around these)

| Boundary                                               | Enforced in                                          |
| ------------------------------------------------------ | ---------------------------------------------------- |
| Model can't emit prices                                | `src/draft.ts` (`BriefingDraft` has no price fields) |
| Repair/reject bad output                               | `src/draft.ts` (`parseBriefingDraft`)                |
| Numbers copied from engine                             | `src/generate.ts`                                    |
| Prompt: no-invent + allow-list + no-command + no-trade | `src/prompt.ts`                                      |
| No execution language / directional needs stop         | `src/validate.ts`                                    |
| Invalid → not stored/published                         | `src/service.ts`                                     |
| Routing tiers / cost                                   | `src/routing.ts`, `src/provider/`                    |
| Duplicate-spend cooldown                               | `src/cache.ts`                                       |
| Cost + token observability                             | `src/health.ts`                                      |
| Schema + safety regression net                         | `test/regression.t013.test.ts` (+ `test/fixtures/`)  |

## What future agents MUST NOT do

- Do not add price/level/size fields to `BriefingDraft`, or otherwise let the
  model output a number that becomes a level. Numbers come from the engine only.
- Do not persist or publish a briefing that failed `validateBriefing`.
- Do not weaken the execution-language ban to "fix" a false positive without a
  test proving real analytical language still passes (see `validate.t008`).
- Do not remove the cooldown cache or make briefings regenerate on every
  duplicate anomaly — that is unbounded spend.
- Do not let the LLM compute statistics, classify anomalies, or query data. It
  receives a validated context packet and returns validated narrative (principle
  #5). All numbers/features/classifications are deterministic code upstream.
- Do not introduce order placement, trading API keys, or position logic anywhere
  in the pipeline (hard rule #1) — not even "read-only".

When a change pushes against a boundary, mark the task `[!]`, write the reason in
`progress.md`, and stop for a human decision (hard rule #10).
