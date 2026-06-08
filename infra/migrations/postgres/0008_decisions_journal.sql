-- P04-T009: user decisions and the trade journal.
-- decisions mirrors Decision; journal_entries/journal_outcomes/trade_tags model
-- JournalTrade split into the entry (always present), the outcome (added on close),
-- and normalized setup tags. Records intent/outcomes only — never execution (rule #1).

CREATE TYPE decision_type AS ENUM ('act', 'skip', 'snooze', 'dismiss', 'watch');
CREATE TYPE trade_side AS ENUM ('buy', 'sell');
CREATE TYPE outcome_status AS ENUM ('open', 'win', 'loss', 'breakeven');

-- Every user action on a briefing, logged with its informing context (rule #4).
-- Plan fields are populated only for `act`. FK RESTRICT preserves the audit log.
CREATE TABLE decisions (
  id              TEXT PRIMARY KEY,
  schema_version  INTEGER NOT NULL,
  briefing_id     TEXT NOT NULL REFERENCES briefings (id) ON DELETE RESTRICT,
  decision_type   decision_type NOT NULL,
  rationale       TEXT,
  planned_entry   DOUBLE PRECISION,
  planned_stop    DOUBLE PRECISION,
  planned_targets DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  risk_r          DOUBLE PRECISION,
  snooze_until    TIMESTAMPTZ,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  decided_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_decisions_briefing ON decisions (briefing_id);
CREATE INDEX idx_decisions_type ON decisions (decision_type);
CREATE INDEX idx_decisions_decided_at ON decisions (decided_at DESC);

-- A journaled trade's entry. `outcome_status` defaults to 'open'; the close
-- details land in journal_outcomes. entry is the TradeLeg {price, at} flattened.
CREATE TABLE journal_entries (
  id                 TEXT PRIMARY KEY,
  schema_version     INTEGER NOT NULL,
  canonical_asset_id TEXT NOT NULL REFERENCES assets (canonical_id) ON DELETE RESTRICT,
  side               trade_side NOT NULL,
  entry_price        DOUBLE PRECISION NOT NULL,
  entry_at           TIMESTAMPTZ NOT NULL,
  size               DOUBLE PRECISION NOT NULL,
  fees               DOUBLE PRECISION NOT NULL DEFAULT 0,
  outcome_status     outcome_status NOT NULL DEFAULT 'open',
  -- Regime at entry (RegimeLabels) — enables analytics by regime.
  regime_at_entry    JSONB,
  -- Triggering signal/anomaly type — enables analytics by signal.
  signal             TEXT,
  linked_briefing_id TEXT REFERENCES briefings (id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_journal_entries_asset ON journal_entries (canonical_asset_id);
CREATE INDEX idx_journal_entries_status ON journal_entries (outcome_status);
CREATE INDEX idx_journal_entries_signal ON journal_entries (signal);

-- The close of a trade (1:1 with an entry). exit is the TradeLeg flattened.
CREATE TABLE journal_outcomes (
  journal_entry_id TEXT PRIMARY KEY REFERENCES journal_entries (id) ON DELETE CASCADE,
  exit_price       DOUBLE PRECISION NOT NULL,
  exit_at          TIMESTAMPTZ NOT NULL,
  realized_pnl     DOUBLE PRECISION NOT NULL,
  r_multiple       DOUBLE PRECISION,
  closed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalized setup tags for a trade — enables analytics sliced by setup.
CREATE TABLE trade_tags (
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
  tag              TEXT NOT NULL,
  PRIMARY KEY (journal_entry_id, tag)
);
CREATE INDEX idx_trade_tags_tag ON trade_tags (tag);
