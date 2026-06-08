-- P04-T013: OHLCV candle aggregates at 1m/5m/15m/1h.
-- Each timeframe is an AggregatingMergeTree fed by a materialized view over
-- normalized_market_events (trade + price_tick rows). Charts read these candle
-- tables directly, never scanning the underlying ticks (Done-when).
--
-- open/close are argMin/argMax over timestamp (AggregateFunction states, read
-- with -Merge); high/low/volume/trades are SimpleAggregateFunction columns the
-- engine merges automatically.

-- ── 1 minute ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ohlcv_1m (
  canonical_asset_id LowCardinality(String),
  venue              LowCardinality(String),
  bucket             DateTime('UTC'),
  open               AggregateFunction(argMin, Float64, DateTime64(3, 'UTC')),
  high               SimpleAggregateFunction(max, Float64),
  low                SimpleAggregateFunction(min, Float64),
  close              AggregateFunction(argMax, Float64, DateTime64(3, 'UTC')),
  volume             SimpleAggregateFunction(sum, Float64),
  trades             SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (canonical_asset_id, venue, bucket);

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_1m_mv TO ohlcv_1m AS
SELECT
  canonical_asset_id,
  venue,
  toStartOfMinute(timestamp) AS bucket,
  argMinState(assumeNotNull(price), timestamp) AS open,
  max(assumeNotNull(price)) AS high,
  min(assumeNotNull(price)) AS low,
  argMaxState(assumeNotNull(price), timestamp) AS close,
  sum(coalesce(size, 0)) AS volume,
  toUInt64(count()) AS trades
FROM normalized_market_events
WHERE event_type IN ('trade', 'price_tick') AND price IS NOT NULL
GROUP BY canonical_asset_id, venue, bucket;

-- ── 5 minutes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ohlcv_5m (
  canonical_asset_id LowCardinality(String),
  venue              LowCardinality(String),
  bucket             DateTime('UTC'),
  open               AggregateFunction(argMin, Float64, DateTime64(3, 'UTC')),
  high               SimpleAggregateFunction(max, Float64),
  low                SimpleAggregateFunction(min, Float64),
  close              AggregateFunction(argMax, Float64, DateTime64(3, 'UTC')),
  volume             SimpleAggregateFunction(sum, Float64),
  trades             SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (canonical_asset_id, venue, bucket);

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_5m_mv TO ohlcv_5m AS
SELECT
  canonical_asset_id,
  venue,
  toStartOfFiveMinutes(timestamp) AS bucket,
  argMinState(assumeNotNull(price), timestamp) AS open,
  max(assumeNotNull(price)) AS high,
  min(assumeNotNull(price)) AS low,
  argMaxState(assumeNotNull(price), timestamp) AS close,
  sum(coalesce(size, 0)) AS volume,
  toUInt64(count()) AS trades
FROM normalized_market_events
WHERE event_type IN ('trade', 'price_tick') AND price IS NOT NULL
GROUP BY canonical_asset_id, venue, bucket;

-- ── 15 minutes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ohlcv_15m (
  canonical_asset_id LowCardinality(String),
  venue              LowCardinality(String),
  bucket             DateTime('UTC'),
  open               AggregateFunction(argMin, Float64, DateTime64(3, 'UTC')),
  high               SimpleAggregateFunction(max, Float64),
  low                SimpleAggregateFunction(min, Float64),
  close              AggregateFunction(argMax, Float64, DateTime64(3, 'UTC')),
  volume             SimpleAggregateFunction(sum, Float64),
  trades             SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (canonical_asset_id, venue, bucket);

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_15m_mv TO ohlcv_15m AS
SELECT
  canonical_asset_id,
  venue,
  toStartOfFifteenMinutes(timestamp) AS bucket,
  argMinState(assumeNotNull(price), timestamp) AS open,
  max(assumeNotNull(price)) AS high,
  min(assumeNotNull(price)) AS low,
  argMaxState(assumeNotNull(price), timestamp) AS close,
  sum(coalesce(size, 0)) AS volume,
  toUInt64(count()) AS trades
FROM normalized_market_events
WHERE event_type IN ('trade', 'price_tick') AND price IS NOT NULL
GROUP BY canonical_asset_id, venue, bucket;

-- ── 1 hour ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ohlcv_1h (
  canonical_asset_id LowCardinality(String),
  venue              LowCardinality(String),
  bucket             DateTime('UTC'),
  open               AggregateFunction(argMin, Float64, DateTime64(3, 'UTC')),
  high               SimpleAggregateFunction(max, Float64),
  low                SimpleAggregateFunction(min, Float64),
  close              AggregateFunction(argMax, Float64, DateTime64(3, 'UTC')),
  volume             SimpleAggregateFunction(sum, Float64),
  trades             SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (canonical_asset_id, venue, bucket);

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_1h_mv TO ohlcv_1h AS
SELECT
  canonical_asset_id,
  venue,
  toStartOfHour(timestamp) AS bucket,
  argMinState(assumeNotNull(price), timestamp) AS open,
  max(assumeNotNull(price)) AS high,
  min(assumeNotNull(price)) AS low,
  argMaxState(assumeNotNull(price), timestamp) AS close,
  sum(coalesce(size, 0)) AS volume,
  toUInt64(count()) AS trades
FROM normalized_market_events
WHERE event_type IN ('trade', 'price_tick') AND price IS NOT NULL
GROUP BY canonical_asset_id, venue, bucket;
