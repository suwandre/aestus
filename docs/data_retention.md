# Data retention & downsampling

Aestus is single-user and self-hosted on one small VPS (€10–30/mo target, see
`docs/adr/ADR-001-stack.md`). Disk is the constraint that matters: a couple of
crypto perps plus a handful of macro proxies still produce a high-volume tick
stream, while the decision record (briefings, decisions, journal) is tiny but
must never be lost. Retention is therefore tiered: **aggressively expire raw
high-frequency data, keep aggregates longer, keep the decision record forever.**

## Principles

1. **Raw ticks are disposable** once aggregated. Their value is short-lived
   (replay/debugging, recent feature math); candles preserve the long-term shape.
2. **Aggregates are cheap and durable.** Downsample, then keep for a long time.
3. **The decision record is sacred.** Briefings, decisions, and the trade
   journal are never auto-expired — they are the product (hard rule #4).
4. **Prefer engine-native expiry.** ClickHouse `TTL` deletes/rolls up data during
   normal merges (no cron). Postgres tables that need pruning use a scheduled job.

## Retention by dataset

| Dataset                                               | Store      | Full resolution | Then                            | Rationale                                                               |
| ----------------------------------------------------- | ---------- | --------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `raw_market_events` (envelopes)                       | ClickHouse | 30 days         | delete                          | Replay/debug window; payloads live in object store, expired separately. |
| Raw payloads (object store)                           | object     | 7 days          | delete                          | Largest blobs; only needed for very recent exact replay.                |
| `normalized_market_events` (ticks)                    | ClickHouse | 14 days         | delete (candles remain)         | Highest-volume table; OHLCV preserves the history charts need.          |
| `ohlcv_1m`                                            | ClickHouse | 180 days        | delete                          | Intraday detail rarely needed beyond ~6 months.                         |
| `ohlcv_5m`, `ohlcv_15m`                               | ClickHouse | 2 years         | delete                          | Mid-resolution backtests/analogues.                                     |
| `ohlcv_1h`                                            | ClickHouse | indefinite      | keep                            | Tiny footprint; full price history for charts/analogues.                |
| `feature_snapshots`                                   | ClickHouse | 180 days        | delete                          | Drives analogue matching; older state has diminishing value.            |
| `anomaly_metrics`                                     | ClickHouse | 2 years         | delete                          | Small; analytics on what triggered past anomalies.                      |
| `news_items` / `news_entities`                        | Postgres   | 180 days        | delete (cascades to embeddings) | Narrative ages out; cited items survive via briefing snapshots.         |
| `news_embeddings`                                     | Postgres   | tied to item    | delete with item                | pgvector rows are heavy; expire with their news item.                   |
| `macro_events`                                        | Postgres   | indefinite      | keep                            | Small reference/calendar data.                                          |
| `on_chain_events`                                     | Postgres   | 365 days        | delete                          | Moderate volume; recent flows are what inform context.                  |
| `context_packets` (+ items)                           | Postgres   | 365 days        | delete unless cited             | Reproduce recent briefings; older ones rarely re-opened.                |
| `briefings`                                           | Postgres   | **forever**     | keep                            | Decision audit trail.                                                   |
| `decisions`                                           | Postgres   | **forever**     | keep                            | Every user action is logged permanently (hard rule #4).                 |
| `journal_entries` / `journal_outcomes` / `trade_tags` | Postgres   | **forever**     | keep                            | The trade journal is the product.                                       |

## Implementation

### ClickHouse — engine `TTL`

TTLs are applied as `ALTER TABLE ... MODIFY TTL` (kept out of the create-table
migrations so retention can be tuned without rewriting schema migrations). Apply
in a future migration / ops step:

```sql
ALTER TABLE raw_market_events        MODIFY TTL received_at + INTERVAL 30 DAY;
ALTER TABLE normalized_market_events MODIFY TTL timestamp   + INTERVAL 14 DAY;
ALTER TABLE ohlcv_1m                 MODIFY TTL bucket       + INTERVAL 180 DAY;
ALTER TABLE ohlcv_5m                 MODIFY TTL bucket       + INTERVAL 730 DAY;
ALTER TABLE ohlcv_15m                MODIFY TTL bucket       + INTERVAL 730 DAY;
-- ohlcv_1h: no TTL (kept indefinitely)
ALTER TABLE feature_snapshots        MODIFY TTL timestamp    + INTERVAL 180 DAY;
ALTER TABLE anomaly_metrics          MODIFY TTL detected_at  + INTERVAL 730 DAY;
```

`ohlcv_1h` deliberately has no TTL — it is the permanent low-resolution price
history. The full tick → candle downsampling already happens continuously via the
materialized views in `0003_ohlcv_aggregates.sql`, so dropping ticks after 14 days
loses no chart data.

### Postgres — scheduled prune

Postgres has no native row TTL, so time-boxed tables are pruned by a periodic job
(wired up in a later ops phase) that runs, e.g. nightly:

```sql
DELETE FROM news_items     WHERE published_at < now() - INTERVAL '180 days';
DELETE FROM on_chain_events WHERE occurred_at  < now() - INTERVAL '365 days';
DELETE FROM context_packets WHERE generated_at < now() - INTERVAL '365 days';
```

`news_embeddings` rows cascade from `news_items`. **`briefings`, `decisions`, and
the journal tables are never included in any prune job.**

## Cost check

Dropping full-resolution ticks at 14 days caps the largest table at roughly two
weeks of `normalized_market_events`; everything older is candles and feature
snapshots, which are orders of magnitude smaller. This keeps total disk well
within a small VPS volume and the €10–30/mo envelope, while the high-value
decision record stays small and permanent.
