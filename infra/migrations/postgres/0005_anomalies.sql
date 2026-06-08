-- P04-T006: anomalies plus their normalized context references.
-- Mirrors AnomalyEvent in packages/contracts/src/anomaly.ts. The contract's flat
-- `context_refs` string array is normalized here into `anomaly_context_refs` so
-- links to market/news/macro/on-chain/historical context are typed and queryable.

CREATE TYPE anomaly_type AS ENUM (
  'funding_spike',
  'oi_surge',
  'volume_anomaly',
  'correlation_break',
  'basis_dislocation',
  'whale_flow',
  'macro_approaching'
);
CREATE TYPE anomaly_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE anomaly_status AS ENUM ('active', 'acknowledged', 'resolved', 'expired', 'dismissed');
CREATE TYPE anomaly_context_ref_type AS ENUM ('market', 'news', 'macro', 'on_chain', 'historical', 'feature');

CREATE TABLE anomalies (
  id          TEXT PRIMARY KEY,
  type        anomaly_type NOT NULL,
  severity    anomaly_severity NOT NULL,
  -- Statistical magnitude in std devs; null for schedule-driven types.
  sigma       DOUBLE PRECISION,
  -- Canonical asset ids and venue ids this anomaly concerns.
  assets      TEXT[] NOT NULL DEFAULT '{}',
  venues      TEXT[] NOT NULL DEFAULT '{}',
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  status      anomaly_status NOT NULL DEFAULT 'active',
  -- Id of the detection rule that fired, if rule-based.
  rule_ref    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_anomalies_status ON anomalies (status);
CREATE INDEX idx_anomalies_detected_at ON anomalies (detected_at DESC);
CREATE INDEX idx_anomalies_type ON anomalies (type);

-- Typed links from an anomaly to the events/snapshots that justify it.
CREATE TABLE anomaly_context_refs (
  anomaly_id TEXT NOT NULL REFERENCES anomalies (id) ON DELETE CASCADE,
  ref_type   anomaly_context_ref_type NOT NULL,
  -- The referenced id/ref string (e.g. a news id, on-chain event id, feature ref).
  ref        TEXT NOT NULL,
  PRIMARY KEY (anomaly_id, ref_type, ref)
);
CREATE INDEX idx_anomaly_context_refs_ref ON anomaly_context_refs (ref_type, ref);
