-- P04-T007: context packets — the immutable, structured snapshot that a briefing
-- is generated from. Mirrors ContextPacket in packages/contracts/src/context-packet.ts.
-- Storing the full snapshot (scalars here, list items in context_packet_items)
-- lets a briefing be reproduced even if the source tables later change.

CREATE TYPE context_packet_item_type AS ENUM (
  'correlated_asset',
  'news',
  'macro',
  'on_chain',
  'historical_analogue'
);

CREATE TABLE context_packets (
  id                  TEXT PRIMARY KEY,
  schema_version      INTEGER NOT NULL,
  generated_at        TIMESTAMPTZ NOT NULL,
  primary_asset       TEXT NOT NULL REFERENCES assets (canonical_id) ON DELETE RESTRICT,
  -- Navigable link to the triggering anomaly; the full trigger is also snapshotted
  -- in `trigger` so the packet reproduces even if the anomaly row is removed.
  trigger_anomaly_id  TEXT REFERENCES anomalies (id) ON DELETE SET NULL,
  trigger             JSONB NOT NULL,
  -- Primary asset FeatureSnapshot at packet assembly time.
  market_snapshot     JSONB NOT NULL,
  -- Code-computed price levels (hard rule #2).
  deterministic_levels JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_context_packets_primary_asset ON context_packets (primary_asset);
CREATE INDEX idx_context_packets_generated_at ON context_packets (generated_at DESC);

-- The variable-length list members of a packet (correlated assets, news, macro,
-- on-chain, historical analogues), each stored as a structured JSONB snapshot
-- with an explicit ordinal so the packet reassembles in order.
CREATE TABLE context_packet_items (
  packet_id TEXT NOT NULL REFERENCES context_packets (id) ON DELETE CASCADE,
  item_type context_packet_item_type NOT NULL,
  position  INTEGER NOT NULL,
  payload   JSONB NOT NULL,
  PRIMARY KEY (packet_id, item_type, position)
);
CREATE INDEX idx_context_packet_items_packet ON context_packet_items (packet_id);
