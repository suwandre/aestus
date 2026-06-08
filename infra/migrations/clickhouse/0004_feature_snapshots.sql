-- P04-T014: rolling feature snapshots over time.
-- Mirrors FeatureSnapshot in packages/contracts/src/feature-snapshot.ts.
-- `schema_version` versions the feature fields; horizon-keyed metrics are Maps,
-- correlation/basis sets are Nested (parallel-array) columns, regime is split
-- into its three labels. ORDER BY (asset, timestamp) for rolling-state reads.

CREATE TABLE IF NOT EXISTS feature_snapshots (
  schema_version     UInt16,
  canonical_asset_id LowCardinality(String),
  timestamp          DateTime64(3, 'UTC'),

  -- Horizon-keyed metrics, e.g. {'1h': 0.012, '24h': -0.03}.
  returns            Map(String, Float64),
  volatility         Map(String, Float64),
  z_scores           Map(String, Float64),

  -- Nullable: not every asset has funding / open interest / computable volume.
  funding_z          Nullable(Float64),
  oi_delta           Nullable(Float64),
  volume_z           Nullable(Float64),

  -- Rolling correlations vs other assets (Nested = parallel arrays).
  correlation_set Nested (
    asset       LowCardinality(String),
    correlation Float64,
    window      LowCardinality(String)
  ),

  -- Cross-venue / spot-perp basis readings.
  basis Nested (
    reference LowCardinality(String),
    basis_bps Float64
  ),

  -- Deterministic regime labels.
  regime_trend       LowCardinality(String),
  regime_volatility  LowCardinality(String),
  regime_risk        LowCardinality(String),

  ingested_at        DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (canonical_asset_id, timestamp);
