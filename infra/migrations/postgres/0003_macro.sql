-- P04-T004: scheduled macro/economic-calendar events.
-- Mirrors MacroEvent in packages/contracts/src/macro.ts, plus revision tracking
-- so a row can be updated in place when the actual print lands or is revised.

CREATE TYPE macro_importance AS ENUM ('low', 'medium', 'high');

CREATE TABLE macro_events (
  event_id     TEXT PRIMARY KEY,
  region       TEXT NOT NULL,
  currency     TEXT NOT NULL,
  title        TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  importance   macro_importance NOT NULL,
  -- Nullable numeric prints: `actual` is null until the print lands; any field
  -- is null when the event carries no numeric value.
  consensus    DOUBLE PRECISION,
  previous     DOUBLE PRECISION,
  actual       DOUBLE PRECISION,
  source       TEXT NOT NULL,
  -- Revision tracking: when `actual` first arrived, when it was last revised,
  -- and how many times — lets the calendar update events as data comes in.
  actual_at    TIMESTAMPTZ,
  revised_at   TIMESTAMPTZ,
  revision     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_macro_events_scheduled_at ON macro_events (scheduled_at);
CREATE INDEX idx_macro_events_importance ON macro_events (importance);
