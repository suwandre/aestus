# services/features

Rust feature engine. Consumes normalized market events and computes
deterministic rolling features (returns, volatility, z-scores, OI delta,
funding z-score, correlation, basis, regime labels).

Owned by: feature agents (P09).
Consumes: `normalized.market` NATS stream.
Publishes: `feature.snapshot` NATS stream.
Persists: feature snapshots to ClickHouse; latest to Redis.
