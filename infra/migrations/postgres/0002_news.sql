-- P04-T003: news/narrative items, their entity links, and an embedding placeholder.
-- Mirrors NewsItem in packages/contracts/src/news.ts.

CREATE TYPE news_source_type AS ENUM ('rss', 'news', 'social', 'other');
CREATE TYPE sentiment AS ENUM ('positive', 'neutral', 'negative');

-- A single news/narrative item. `url_hash` enables dedup across feeds that
-- surface the same article; `source`/`source_type` carry the source metadata.
CREATE TABLE news_items (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  -- Stable hash (e.g. sha256 hex) of the canonical URL — unique for dedup.
  url_hash        TEXT NOT NULL,
  source          TEXT NOT NULL,
  source_type     news_source_type NOT NULL DEFAULT 'news',
  published_at    TIMESTAMPTZ NOT NULL,
  summary         TEXT NOT NULL,
  relevance_score DOUBLE PRECISION NOT NULL CHECK (relevance_score >= 0 AND relevance_score <= 1),
  sentiment       sentiment NOT NULL,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_news_items_url_hash ON news_items (url_hash);
CREATE INDEX idx_news_items_published_at ON news_items (published_at DESC);
CREATE INDEX idx_news_items_source ON news_items (source);

-- Entities mentioned in an item — canonical asset ids, tickers, orgs, people.
-- `canonical_asset_id` is set when the entity resolves to a tracked asset, so
-- news can be queried by asset; `entity` indexed for free-text entity queries.
CREATE TABLE news_entities (
  news_id            TEXT NOT NULL REFERENCES news_items (id) ON DELETE CASCADE,
  entity             TEXT NOT NULL,
  canonical_asset_id TEXT REFERENCES assets (canonical_id) ON DELETE SET NULL,
  PRIMARY KEY (news_id, entity)
);
CREATE INDEX idx_news_entities_entity ON news_entities (entity);
CREATE INDEX idx_news_entities_asset ON news_entities (canonical_asset_id);

-- Embedding placeholder for future similarity search (briefing recall / analogue
-- matching). Dimension is left unbounded until the embedding model is chosen;
-- an ivfflat/hnsw index over a fixed-dim column is added then (see docs/migrations.md).
CREATE TABLE news_embeddings (
  news_id    TEXT PRIMARY KEY REFERENCES news_items (id) ON DELETE CASCADE,
  embedding  vector,
  model      TEXT,
  dim        INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
