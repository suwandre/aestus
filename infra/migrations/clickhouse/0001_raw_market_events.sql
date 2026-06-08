-- P04-T011: raw market event envelopes retained for replay/debugging.
-- Mirrors RawMarketEvent in packages/contracts/src/raw-event.ts. The full payload
-- lives in an object store keyed by raw_payload_hash; this table is the index of
-- what was received, when, and in what order, so any message can be replayed.

CREATE TABLE IF NOT EXISTS raw_market_events (
  schema_version     UInt16,
  source             String,
  venue              LowCardinality(String),
  received_at        DateTime64(3, 'UTC'),
  provider_timestamp Nullable(DateTime64(3, 'UTC')),
  sequence           UInt64,
  event_type         LowCardinality(String),
  raw_payload_hash   String,
  ingested_at        DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(received_at)
ORDER BY (venue, source, received_at, sequence);
