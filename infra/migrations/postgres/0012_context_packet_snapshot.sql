-- P11-T010: store the complete ContextPacket as a single JSONB snapshot so a
-- briefing can be reproduced losslessly even after live state changes. The
-- normalized columns/items in 0006 predate later contract sections
-- (venue_comparison from P11-T004, source_freshness from P11-T009); `snapshot`
-- is the forward-compatible source of truth for reproduction, the normalized
-- columns remain for indexed queries. Nullable so the migration is safe over
-- any existing rows; the context service always writes it on save.

ALTER TABLE context_packets ADD COLUMN snapshot JSONB;
