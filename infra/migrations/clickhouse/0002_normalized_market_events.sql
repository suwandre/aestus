-- P04-T012: normalized market event history.
-- Mirrors the NormalizedMarketEvent discriminated union (8 variants) in
-- packages/contracts/src/normalized-event.ts as one wide table: shared envelope
-- columns plus nullable per-variant columns, discriminated by `event_type`.
-- ORDER BY (canonical_asset_id, event_type, timestamp) makes per-asset/time
-- queries a prefix scan rather than a full scan.

CREATE TABLE IF NOT EXISTS normalized_market_events (
  schema_version     UInt16,
  event_type         LowCardinality(String),
  venue              LowCardinality(String),
  instrument_id      LowCardinality(String),
  canonical_asset_id LowCardinality(String),
  timestamp          DateTime64(3, 'UTC'),
  sequence           Nullable(UInt64),

  -- price_tick / trade / liquidation
  price              Nullable(Float64),
  bid                Nullable(Float64),
  ask                Nullable(Float64),
  size               Nullable(Float64),
  side               Nullable(Enum8('buy' = 1, 'sell' = 2)),
  trade_id           Nullable(String),

  -- orderbook_delta ([price, size] levels; size 0 removes the level)
  bids               Array(Tuple(Float64, Float64)) DEFAULT [],
  asks               Array(Tuple(Float64, Float64)) DEFAULT [],
  is_snapshot        Nullable(UInt8),

  -- funding_rate
  funding_rate       Nullable(Float64),
  next_funding_time  Nullable(DateTime64(3, 'UTC')),
  interval_hours     Nullable(Float64),

  -- open_interest
  open_interest      Nullable(Float64),
  notional           Nullable(Float64),

  -- mark_price / index_price
  mark_price         Nullable(Float64),
  index_price        Nullable(Float64),

  ingested_at        DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (canonical_asset_id, event_type, timestamp);
