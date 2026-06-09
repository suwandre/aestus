-- P08-T006: add source_confidence to news_items and macro_events.
--
-- A single shared ENUM covers all contextual data types (news, calendar,
-- on-chain). On-chain events already carry this via the application layer;
-- this migration extends the two Postgres tables that lacked it.

CREATE TYPE source_confidence AS ENUM ('high', 'medium', 'low');

ALTER TABLE news_items
    ADD COLUMN source_confidence source_confidence NOT NULL DEFAULT 'medium';

ALTER TABLE macro_events
    ADD COLUMN source_confidence source_confidence NOT NULL DEFAULT 'medium';
