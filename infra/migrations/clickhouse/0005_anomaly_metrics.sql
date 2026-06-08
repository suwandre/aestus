-- P04-T015: anomaly metrics — the feature values captured at an anomaly's trigger.
-- The canonical anomaly record lives in Postgres (anomalies, P04-T006); this table
-- is the analytics side, retaining severity/sigma and the feature state at trigger
-- time so analysts can inspect what was behind each triggered anomaly (Done-when).

CREATE TABLE IF NOT EXISTS anomaly_metrics (
  anomaly_id         String,
  type               LowCardinality(String),
  severity           LowCardinality(String),
  -- Statistical magnitude in std devs; null for schedule-driven types.
  sigma              Nullable(Float64),
  canonical_asset_id LowCardinality(String),
  detected_at        DateTime64(3, 'UTC'),

  -- Named feature values at trigger time (convenience columns).
  funding_z          Nullable(Float64),
  oi_delta           Nullable(Float64),
  volume_z           Nullable(Float64),

  -- Arbitrary feature values at trigger (z_scores, returns, etc.).
  feature_values     Map(String, Float64),

  -- Regime labels at trigger time.
  regime_trend       LowCardinality(String),
  regime_volatility  LowCardinality(String),
  regime_risk        LowCardinality(String),

  ingested_at        DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(detected_at)
ORDER BY (canonical_asset_id, type, detected_at);
