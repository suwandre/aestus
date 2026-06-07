-- Postgres init script — runs once on first container start
-- Extensions required by Aestus:
--   vector  : pgvector for embedding similarity search (briefing recall, analogue matching)
--   uuid-ossp: UUID generation without application-level dependency
--   pg_trgm : trigram similarity for fuzzy text search on news/narrative

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
