# Context packets

A **context packet** is the deterministic snapshot the LLM reasons over when it
drafts a briefing. The context service (`services/context`) consumes an
`anomaly.detected` event, gathers everything relevant to that anomaly, and emits
one `ContextPacket` on `context.packet.<primary_asset>`. The LLM never sees raw
feeds — only this packet — and it never invents the numbers in it (hard rule #2).

- Contract: `packages/contracts/src/context-packet.ts` (`ContextPacket`), JSON
  Schema in `packages/contracts/schema/ContextPacket.schema.json`.
- Assembly: `services/context/src/builder.ts` (`assembleContextPacket`).
- Data access: `ContextDataSource` (`src/data/source.ts`); fixture-backed
  implementation in `src/data/fixtures.ts` (fixture-first, hard rule #5).
- Example packet: `fixtures/context/packets.json`.

## The core rule: missing data is represented, never omitted

A packet always has the same shape. A section that has no data is **present and
explicitly empty/false**, not dropped. Downstream consumers (LLM prompt, UI) can
therefore always tell the difference between "we looked and found nothing" and
"we never looked". Two mechanisms make absence explicit:

1. **Every list section is always present** (defaults to `[]`). An empty array
   means "queried, nothing qualified" — e.g. empty `historical_analogues` is the
   explicit "insufficient history" signal.
2. **`source_freshness` carries one entry per feed** (T009), with `present:
false` for a feed that contributed nothing and `stale: true` for missing or
   out-of-date feeds. The UI shows a stale badge / degraded-source callout from
   this; it must never hide a dead feed behind plausible numbers (UI spec
   §states).

The `quality` block (T012) rolls this up into a single deterministic score so
the LLM can hedge and the UI can warn on weak context.

## What goes into a packet

| Field                  | Source / task                                      | Window or config knob                                       | When "missing"                                                                                         |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `trigger`              | the `anomaly.detected` event                       | —                                                           | never (always present)                                                                                 |
| `market_snapshot`      | primary asset `FeatureSnapshot` (T002)             | latest snapshot                                             | falls back to a neutral **placeholder snapshot**; `source_freshness[market_snapshot].present = false`  |
| `correlated_assets`    | snapshots for configured proxies (T003)            | `CORRELATED_ASSETS` (ETH, SPX, DXY, GOLD, VIX)              | `[]` if none have snapshots; proxies without data are dropped from the list but reflected in freshness |
| `venue_comparison`     | per-venue quotes + dispersion (T004)               | `VENUE_FUNDING_DISPERSION`, `VENUE_BASIS_DISPERSION_BPS`    | **field omitted** when no quotes / no thresholds; `source_freshness[venue_quotes].present = false`     |
| `news`                 | entity-matched, relevance-filtered news (T005)     | `NEWS_WINDOW_MINUTES` (240), `NEWS_MIN_RELEVANCE` (0.5)     | `[]`                                                                                                   |
| `macro`                | macro calendar near the anomaly (T006)             | `MACRO_WINDOW_HOURS` (±72), `MACRO_MIN_IMPORTANCE` (medium) | `[]`                                                                                                   |
| `on_chain`             | asset flows/whales + market-wide stablecoin (T007) | `ONCHAIN_WINDOW_HOURS` (48)                                 | `[]`                                                                                                   |
| `historical_analogues` | prior same-type anomalies, regime-ranked (T008)    | `ANALOGUE_LIMIT` (3)                                        | `[]` = **insufficient history**                                                                        |
| `source_freshness`     | per-feed freshness/staleness (T009)                | `FRESHNESS_STALE_SECONDS` (900)                             | always present; one entry per feed                                                                     |
| `quality`              | completeness/quality score (T012)                  | derived from `source_freshness`                             | always present                                                                                         |
| `deterministic_levels` | code-computed price levels (hard rule #2)          | —                                                           | **placeholder** until the P12 engine lands (marked via `method_notes`)                                 |

`venue_comparison` is the one optional field: it is omitted entirely when there
is nothing to compare, but its absence is still surfaced through
`source_freshness[venue_quotes]`, so it is not a silent omission.

## How freshness is computed

For each feed, `latest_at` is the newest contributing item's timestamp and
`age_seconds = generated_at − latest_at`, clamped to ≥0 (a future macro event
reads as fresh, not "Xs ago"). A feed is `stale` when it is missing **or** its
latest item is older than `FRESHNESS_STALE_SECONDS`. `present` distinguishes a
missing feed (`false`) from a present-but-stale one (`true` + `stale`).

`venue_quotes` freshness reflects the built `venue_comparison` section, not raw
fetched quotes — if no comparison was produced, the feed is reported missing.

## How the quality score is computed

`quality.score` is a weighted completeness/freshness fraction (deterministic, no
LLM input). Each feed earns its weight at full credit when present and fresh,
half credit when present but stale, and nothing when missing:

| Feed                | Weight |
| ------------------- | ------ |
| `market_snapshot`   | 0.50   |
| `correlated_assets` | 0.10   |
| `venue_quotes`      | 0.10   |
| `news`              | 0.10   |
| `macro`             | 0.10   |
| `on_chain`          | 0.10   |

The market snapshot dominates because a packet without the primary asset's state
can't anchor a briefing. Labels: `score ≥ 0.75` → `strong`, `≥ 0.5` →
`adequate`, else `weak`. `degraded_feeds` lists every missing/stale feed and
`notes` is a prompt/UI-ready summary. The `deterministic_levels` placeholder is
intentionally **not** part of the score — quality measures data presence and
freshness only; level quality is the P12 engine's concern.

## Persistence and emission

The full packet is persisted **before** it is published (T010), so a briefing
can be reproduced even if live state later changes. Storage is behind
`PacketStore`: in-memory for fixture-first dev/CI, Postgres (the complete packet
as a JSONB `snapshot`, migration `0012`) when `DATABASE_URL` is set. The packet
is then emitted on `context.packet.<primary_asset>` with `payload_type =
ContextPacket` and the trigger's `trace_id` propagated, so LLM orchestration
receives it asynchronously and a briefing stays correlated back to its anomaly.

## Adding a new section

When a future task adds a data section:

1. Add the field to `ContextPacket` (default `[]` for lists) and regenerate the
   JSON Schema (`bun run gen:schema` in `packages/contracts`).
2. Add a retrieval method to `ContextDataSource` + the fixture implementation.
3. Add a `FeedKind` entry and emit a `source_freshness` row for it in the
   builder, and add its weight to the quality model — otherwise the section can
   go missing without being represented, violating the core rule above.
4. Update `fixtures/context/packets.json` and this document together.
