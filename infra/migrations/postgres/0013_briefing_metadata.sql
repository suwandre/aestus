-- P13-T010: extend briefings with the LLM narrative + observability metadata
-- introduced in P13. The draft's structured fields (factors + the three
-- reasoning strings, P13-T006), a cache-hit flag for observability (whether the
-- briefing came from cache rather than a fresh LLM call), and a full snapshot
-- JSONB for lossless reproduction (mirrors context_packets.snapshot from 0012).
-- The briefings table is not seeded, so existing rows are not a concern; the LLM
-- service writes every column. Levels/cost columns already exist from 0007.

ALTER TABLE briefings
  ADD COLUMN factors                TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN invalidation_reasoning TEXT,
  ADD COLUMN confidence_reasoning   TEXT,
  ADD COLUMN recheck_condition      TEXT,
  ADD COLUMN cache_hit              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN snapshot               JSONB;
