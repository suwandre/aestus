-- P04-T008: briefings — LLM-authored proposals persisted independently of UI state.
-- Mirrors Briefing in packages/contracts/src/briefing.ts. Levels and sizing are
-- copied from the context packet's deterministic levels (hard rule #2). Cost is
-- stored as flat columns to keep spend queryable/visible (hard rule #7).

CREATE TYPE stance AS ENUM ('long', 'short', 'no_trade');

CREATE TABLE briefings (
  id                TEXT PRIMARY KEY,
  schema_version    INTEGER NOT NULL,
  context_packet_id TEXT NOT NULL REFERENCES context_packets (id) ON DELETE RESTRICT,
  generated_at      TIMESTAMPTZ NOT NULL,
  stance            stance NOT NULL,
  thesis            TEXT NOT NULL,
  -- Deterministic levels; null for `no_trade`. entry_zone is {low, high}.
  entry_zone        JSONB,
  invalidation      DOUBLE PRECISION,
  targets           DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  -- Deterministic size suggestion {risk_pct?, notional?, note?}; null for `no_trade`.
  size_suggestion   JSONB,
  timeframe         TEXT NOT NULL,
  confidence        DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  -- LLM model id that authored the briefing (model metadata).
  model             TEXT NOT NULL,
  -- Evidence refs the briefing cited (context packet / news / anomaly ids).
  supporting_context TEXT[] NOT NULL DEFAULT '{}',
  -- Cost metadata (hard rule #7 — keep cost visible).
  cost_provider          TEXT NOT NULL,
  cost_model             TEXT NOT NULL,
  cost_prompt_tokens     INTEGER NOT NULL,
  cost_completion_tokens INTEGER NOT NULL,
  cost_total_tokens      INTEGER NOT NULL,
  cost_usd               DOUBLE PRECISION NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_briefings_context_packet ON briefings (context_packet_id);
CREATE INDEX idx_briefings_generated_at ON briefings (generated_at DESC);
CREATE INDEX idx_briefings_stance ON briefings (stance);
