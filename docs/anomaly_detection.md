# Anomaly Detection Engine (P10)

Reference for the `services/anomaly` Rust service: every detector, its inputs,
thresholds, severity policy, and edge cases. Tune detectors from this document
without re-reading the source.

> **Hard rules.** The engine is purely deterministic — no LLM participates in
> detection (spec §100). It never invents price levels; all inputs come from the
> features service and contextual feeds. It places no orders.

## Pipeline

```
feature.snapshot.>  ─┐
context.packet.>    ─┼─▶ EngineState ─▶ detectors ─▶ severity rescore ─▶ dedupe/cooldown ─▶ publish (anomaly.detected.*)
(macro/news/onchain)─┘                                                                      └─▶ Postgres inbox + ClickHouse metrics
```

- **Inputs** (`input.rs`): `FeatureSnapshot` (enveloped, from features) plus
  un-enveloped contextual events on `context.packet.<macro|news|onchain>.*`.
- **State** (`state.rs`): latest snapshot per asset; bounded rings of macro/news/
  on-chain events; rolling correlation history per pair.
- **Evaluation** runs every `ANOMALY_EVAL_INTERVAL_SECS` (default 30): run all
  detectors → rescore severity → dedupe → publish + persist.
- **Fixture mode** (no `NATS_URL`): load repo fixtures, run one pass in-memory.

## Configuration

Thresholds live in `RulesConfig` (`rules.rs`) with built-in defaults, overlaid at
startup by enabled rows from the Postgres `alert_rules` table (P10-T017). Seed
defaults live in `apps/api/scripts/seed.ts`. Editing a rule and restarting the
service changes detector behavior.

| `alert_rules.condition`      | Param key(s)                                 | RulesConfig field                              | Default       |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------- | ------------- |
| `funding_spike`              | `sigma` (per-asset via `canonical_asset_id`) | `funding[.overrides].z_threshold`              | 2.0           |
| `oi_surge`                   | `oi_delta`                                   | `oi_delta_threshold`                           | 0.05          |
| `volume_anomaly`             | `sigma`                                      | `volume_z_threshold`                           | 2.0           |
| `basis_dislocation`          | `bps`                                        | `basis_spread_bps_threshold`                   | 3.0           |
| `correlation_break`          | `delta`                                      | `correlation_break_delta`                      | 0.5           |
| `liquidation_cluster`        | `min_size`                                   | `liq_cluster_min_size`                         | 1.0           |
| `whale_flow`/`exchange_flow` | `amount_usd`                                 | `whale_min_amount_usd`                         | 5e7           |
| `news_cluster`               | `min_items`,`min_relevance`,`window_minutes` | `news_cluster_*`                               | 2 / 0.5 / 120 |
| `macro_approaching`          | `lead_minutes`,`importance`                  | `macro_window_minutes`, `macro_min_importance` | 60 / high     |
| `cooldown`                   | `minutes`                                    | `cooldown_minutes`                             | 30            |

Unknown conditions and disabled rows are ignored — a bad rule never breaks the
engine.

## Type registry (`registry.rs`)

Each `AnomalyType` carries a display label, severity basis, optional sigma bands,
required fields, and a UI color token (CSS variable from `cockpit.html`).

| Type                  | Label               | Severity basis | UI color   |
| --------------------- | ------------------- | -------------- | ---------- |
| `funding_spike`       | Funding Spike       | Sigma          | `--orange` |
| `oi_surge`            | OI Surge            | Magnitude      | `--blue`   |
| `volume_anomaly`      | Volume Anomaly      | Sigma          | `--teal`   |
| `correlation_break`   | Correlation Break   | Magnitude      | `--purple` |
| `basis_dislocation`   | Basis Dislocation   | Magnitude      | `--pink`   |
| `whale_flow`          | Whale Flow          | Magnitude      | `--green`  |
| `macro_approaching`   | Macro Approaching   | Schedule       | `--blue`   |
| `news_cluster`        | News Cluster        | Magnitude      | `--red`    |
| `liquidation_cluster` | Liquidation Cluster | Magnitude      | `--orange` |
| `exchange_flow`       | Exchange Flow       | Magnitude      | `--green`  |

Default sigma bands (statistical types): `low ≥ 1.5`, `medium ≥ 2.0`,
`high ≥ 2.5`, `critical ≥ 3.5` on `|sigma|`.

## Detectors

Each detector is a pure function over `EngineState` + `RulesConfig`. Anomaly id
is deterministic: `<type>:<primary_asset>:<detected_at>`. Results are sorted by
id for deterministic ordering.

### funding_spike (`detectors/funding.rs`, T003)

- **Input**: `FeatureSnapshot.funding_z` (z-score computed upstream).
- **Rule**: fire when `|funding_z| ≥ z_threshold` (per-asset override supported).
- **Severity**: registry sigma bands on `|z|`.
- **sigma**: the signed `funding_z`.
- **Edge cases**: snapshots without `funding_z` (macro/spot-only) are skipped;
  negative spikes (depressed funding) fire too. The features layer supplies a
  single aggregate `funding_z` per asset (no per-venue z), so venue-level rules
  are not available here — `funding_spread` exists but is not venue-keyed.

### oi_surge (`detectors/oi.rs`, T004)

- **Input**: `oi_delta` (fractional OI change) + `returns` (price direction) + `oi_state`.
- **Rule**: fire when `|oi_delta| ≥ oi_delta_threshold`.
- **Severity** (magnitude): `≥0.15` critical, `≥0.10` high, `≥(threshold+0.10)/2` medium, else low.
- **Context**: description states rising price → "new longs", falling → "new shorts";
  a `oi_state:` context ref is attached.
- **sigma**: `None` (no OI z-score in the snapshot).
- **Edge cases**: missing `oi_delta` skipped; price flat when no return available.

### volume_anomaly (`detectors/volume.rs`, T005)

- **Input**: `volume_z` (rolling z-score; percentile breakout folded in upstream).
- **Rule**: one-sided — fire when `volume_z ≥ volume_z_threshold` (low volume is not anomalous).
- **Severity**: registry sigma bands. **sigma**: `volume_z`.

### liquidation_cluster (`detectors/liquidations.rs`, T006)

- **Input**: `liq_clusters` (bucketed near mid by features, so "near price" by construction).
- **Rule**: flag the **largest** cluster per asset with `total_size ≥ liq_cluster_min_size`.
- **Severity** (magnitude): size/threshold ratio `≥100×` high, `≥10×` medium, else low.
- **Side convention**: `buy`-side = shorts force-bought = **above** price; `sell`-side =
  longs force-sold = **below** price (the snapshot has no absolute price field).
- **Edge cases**: empty/sub-threshold clusters skipped.

### basis_dislocation (`detectors/basis.rs`, T007)

- **Input**: `basis` entries (`reference`, `basis_bps`).
- **Rule**: needs ≥2 references; fire when `max − min basis_bps ≥ basis_spread_bps_threshold`.
- **Severity** (magnitude): spread `≥3×` high, `≥2×` medium, else low.
- **Venues**: parsed from reference prefixes (`binance-spot` → `binance`).
- **Edge cases**: single reference does not fire; funding divergence is out of scope here.

### correlation_break (`detectors/correlation.rs`, T008)

- **Input**: `correlation_set` + rolling history in `EngineState.correlation_history`.
- **Rule**: baseline = mean of prior readings; fire when `|current − baseline| ≥ correlation_break_delta`.
- **Severity** (magnitude): departure `≥2.5×` high, `≥1.5×` medium, else low.
- **Edge cases**: needs ≥2 observations of a pair (a single snapshot only seeds the
  baseline); references both assets. History bounded to 60 points per pair.

### macro_approaching (`detectors/macro_event.rs`, T009)

- **Input**: `macro_events`; uses `now_ms`.
- **Rule**: fire when `0 ≤ scheduled_at − now ≤ macro_window_minutes` AND
  `importance ≥ macro_min_importance`.
- **Severity** (schedule): lead `≤15 min` high, else medium.
- **Assets**: macro prints are market-wide → attach watched crypto assets (sorted),
  falling back to `macro:<region>` so assets is non-empty.
- **Edge cases**: past events and below-importance events do not fire.

### whale_flow / exchange_flow (`detectors/onchain.rs`, T010)

- **Input**: on-chain events; gate on `|amount_usd|` (fallback `|amount|`).
- **Rule**: fire when magnitude `≥ whale_min_amount_usd`. `whale_transfer` →
  `whale_flow` (classification: accumulation/distribution); `exchange_flow` event →
  `exchange_flow` anomaly (direction: inflow/outflow/net).
- **Severity** (magnitude): USD/threshold ratio `≥3×` high, `≥1.5×` medium, else low.
- **Context ref**: `onchain:<event_type>:<tx_hash[..8]|timestamp>`.
- **Edge cases**: stablecoin mint/burn, token unlock, dex activity are not yet detected.

### news_cluster (`detectors/news.rs`, T011) — placeholder

- **Input**: `news_items`. Groups only canonical-asset entities (contain `:`) to
  avoid double-counting tickers/tags.
- **Rule**: fire when `≥ news_cluster_min_items` items with `relevance ≥ min_relevance`
  share an entity within `news_cluster_window_minutes` of the newest.
- **Severity** (magnitude): count/avg-relevance (`≥4` or avg `≥0.85` high; `≥3` or `≥0.7` medium).
- **Note**: deterministic keyword/entity clustering; semantic (embedding) clustering
  is a future enhancement (P07 embeddings). Top tag chosen deterministically
  (count desc, then lexicographic).

## Severity scoring (`severity.rs`, T013)

After detection, every anomaly is rescored on a unified 0–100 conviction score and
mapped back to a severity bucket, so all types rank on one scale:

```
score = 0.40·magnitude + 0.25·confidence + 0.15·recency + 0.20·priority   (×100)
```

- **magnitude**: `|sigma|/critical_band` for sigma types, else the detector bucket
  (low .3 / medium .55 / high .8 / critical 1.0).
- **confidence** (per type): funding/volume 0.9, macro 0.95, oi/basis/liq 0.8,
  correlation 0.75, whale/exchange 0.7, news 0.5.
- **recency**: linear decay over 24h.
- **priority**: max asset priority (BTC 1.0 / ETH 0.9 / SOL 0.7, default 0.5).

Buckets: `≤44` low, `45–64` medium, `65–84` high, `≥85` critical. Stable for fixed
inputs. The score also feeds briefing conviction (P12).

## Dedupe / cooldown (`dedupe.rs`, T012)

Logical alert identity = `<type>|<primary_asset>`. Within `cooldown_minutes`
(default 30) a repeat is suppressed (not re-published) but bumps `count` and
`last_seen` on the active record. The first occurrence and any post-cooldown
re-fire are emitted. `count`/`last_seen` are dedupe-internal (not contract fields).

## Status lifecycle (`lifecycle.rs`, T014)

States: `active`, `acknowledged`, `snoozed`, `resolved`, `expired`, `dismissed`.
Terminal = resolved/expired/dismissed (sinks). `active` → any; `acknowledged`/
`snoozed` → active or close. `StatusStore.tick` wakes elapsed snoozes → active and
expires aged active/acknowledged → expired. The store is the in-process source of
truth, seeded from the durable inbox (`load_active`) on startup.

The API/UI drive transitions over HTTP on `ANOMALY_PORT`:

- `GET /anomalies/{id}/status` → `{ "id", "status" }` (current status; `active` if untracked).
- `POST /anomalies/{id}/status` with `{ "status", "snooze_until_ms"? }` → applies the
  change (legal transitions enforced; `409` on illegal, `400` on unknown status) and
  persists it via `PostgresAnomalySink::update_status` so it survives a restart.

A richer P17 API layer may front this; the engine owns the authoritative store.

## Persistence (`persist.rs`, T015)

- **Postgres** (`anomalies` + `anomaly_context_refs`): durable inbox; upsert by id;
  `load_active` reloads non-terminal anomalies at startup and seeds the deduper so
  a restart neither loses nor re-alerts. Context refs normalized by prefix →
  `ref_type` (feature/macro/news/on_chain/market/historical); others kept in-memory only.
- **ClickHouse** (`anomaly_metrics`): one analytics row per trigger with
  severity/sigma + feature state (funding_z/oi_delta/volume_z/z_scores/returns/regime).
- Both no-op without their URL (fixture-first). Taxonomy enums extended in migration
  `0011_anomaly_taxonomy_extend.sql` (news_cluster, liquidation_cluster, exchange_flow,
  snoozed).

## Publishing (`publish.rs`, T016)

Each validated anomaly is wrapped in an `Envelope<AnomalyEvent>` and published to
`anomaly.detected.<type>.<sanitized_asset>` (stream `ANOMALY_DETECTED`) for the
context builder, API, alerts, and UI. Invalid anomalies (empty id/assets/title/
description) are never published.

## Health

Heartbeat on `system.health.anomaly`; HTTP `/health` (plus the status-lifecycle routes
above) on `ANOMALY_PORT` (default 8083).
