-- P04-T002: canonical asset, venue, instrument, and watchlist structures.
-- Mirrors AssetIdentity / Venue / VenueInstrument in packages/contracts.
-- Enums mirror common.ts (AssetClass) and venue.ts (MarketType).

CREATE TYPE asset_class AS ENUM ('crypto', 'equity_index', 'fx', 'commodity', 'volatility', 'rates');
CREATE TYPE market_type AS ENUM ('perp', 'spot', 'futures', 'option', 'macro_proxy');

-- Canonical, venue-agnostic asset identity. `canonical_id` is the FK target used everywhere.
CREATE TABLE assets (
  canonical_id TEXT PRIMARY KEY,
  symbol       TEXT NOT NULL,
  base         TEXT,
  quote        TEXT,
  asset_class  asset_class NOT NULL,
  display_name TEXT NOT NULL,
  icon_key     TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_symbol ON assets (symbol);
CREATE INDEX idx_assets_asset_class ON assets (asset_class);

-- A data source / exchange Aestus ingests from.
CREATE TABLE venues (
  venue_id     TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  market_types market_type[] NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A tradeable instrument on a specific venue, linked to a canonical asset.
-- tick_size/lot_size are TEXT to preserve exact decimal precision (per the contract).
CREATE TABLE venue_instruments (
  venue_id           TEXT NOT NULL REFERENCES venues (venue_id) ON DELETE CASCADE,
  instrument_id      TEXT NOT NULL,
  market_type        market_type NOT NULL,
  canonical_asset_id TEXT NOT NULL REFERENCES assets (canonical_id) ON DELETE CASCADE,
  tick_size          TEXT NOT NULL,
  lot_size           TEXT NOT NULL,
  quote_currency     TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, instrument_id)
);
CREATE INDEX idx_venue_instruments_asset ON venue_instruments (canonical_asset_id);

-- User-defined watchlists (single-user, but multiple named lists are allowed).
CREATE TABLE watchlists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership of assets in a watchlist, with an explicit display order.
CREATE TABLE watchlist_members (
  watchlist_id       TEXT NOT NULL REFERENCES watchlists (id) ON DELETE CASCADE,
  canonical_asset_id TEXT NOT NULL REFERENCES assets (canonical_id) ON DELETE CASCADE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, canonical_asset_id)
);
CREATE INDEX idx_watchlist_members_asset ON watchlist_members (canonical_asset_id);
