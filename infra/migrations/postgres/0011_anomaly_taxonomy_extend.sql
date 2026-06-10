-- P10-T015: extend the anomaly taxonomy to match the types/statuses the
-- detection engine emits. The original ENUMs (0005_anomalies.sql) predate the
-- detectors added in P10: news_cluster (T011), liquidation_cluster (T006),
-- exchange_flow (T010), and the snoozed lifecycle state (T014). Adding ENUM
-- values is backward-compatible (existing rows keep their values).
--
-- ALTER TYPE ... ADD VALUE is allowed inside a transaction on PostgreSQL 12+
-- because these enums were created in an earlier, already-committed migration
-- and the new values are not used within this same transaction.

ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'news_cluster';
ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'liquidation_cluster';
ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'exchange_flow';
ALTER TYPE anomaly_status ADD VALUE IF NOT EXISTS 'snoozed';
