-- P04-T010: single-user configuration. Watchlists already exist (0001_assets.sql);
-- this adds the remaining config domains. All persist in Postgres (durable volume),
-- so settings survive restarts.

-- User-defined alert rules (e.g. funding > x, price crosses level). `condition`
-- names the rule kind; `params` carries its thresholds/operands as JSONB.
CREATE TABLE alert_rules (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  -- Optional asset scope; null = applies across assets.
  canonical_asset_id TEXT REFERENCES assets (canonical_id) ON DELETE CASCADE,
  condition          TEXT NOT NULL,
  params             JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_rules_enabled ON alert_rules (enabled);

-- Feed enablement: one row per ingest feed (e.g. 'binance', 'rss:coindesk').
CREATE TABLE feed_settings (
  feed_id    TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Model routing: which provider/model handles each LLM task kind (e.g. 'briefing',
-- 'classification') — see the runtime-LLM-provider DECISION in progress.md.
CREATE TABLE model_routing (
  task_kind  TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  params     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification channels (telegram/email/webhook/...). `config` holds tokens/targets.
CREATE TABLE notification_channels (
  id           TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Layout / UI preferences as a keyed JSONB store (per tab/widget or global).
CREATE TABLE layout_preferences (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
