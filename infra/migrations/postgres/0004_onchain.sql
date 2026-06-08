-- P04-T005: on-chain events (flows, whale transfers, mints/burns, unlocks, dex).
-- Flattens the OnChainEvent discriminated union (packages/contracts/src/onchain.ts)
-- into one generic table; variant-specific fields live in `attributes` (JSONB).
-- `id` is the stable key context packets reference (P04-T007).

CREATE TYPE on_chain_event_type AS ENUM (
  'exchange_flow',
  'whale_transfer',
  'stablecoin_mint_burn',
  'token_unlock',
  'dex_activity'
);

CREATE TABLE on_chain_events (
  id          TEXT PRIMARY KEY,
  event_type  on_chain_event_type NOT NULL,
  chain       TEXT NOT NULL,
  -- Canonical asset id, or a bare chain-native symbol — not FK-constrained
  -- because chain-native assets are not always tracked in `assets`.
  asset_id    TEXT NOT NULL,
  -- Primary magnitude in asset units (amount) or USD volume, per variant.
  value       DOUBLE PRECISION NOT NULL,
  value_usd   DOUBLE PRECISION,
  -- Labeled wallets / exchanges / addresses involved in the event.
  addresses   TEXT[] NOT NULL DEFAULT '{}',
  -- Variant-specific fields: direction, exchange, from_label, to_label,
  -- classification, tx_hash, action, stablecoin, category, dex, pool, activity_type.
  attributes  JSONB NOT NULL DEFAULT '{}'::jsonb,
  source      TEXT NOT NULL,
  -- Reference to the retained raw provider record (provider id / payload hash).
  raw_ref     TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_on_chain_events_asset ON on_chain_events (asset_id);
CREATE INDEX idx_on_chain_events_occurred_at ON on_chain_events (occurred_at DESC);
CREATE INDEX idx_on_chain_events_type ON on_chain_events (event_type);
