import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";

/**
 * Source-traceable envelope wrapping every raw message as ingested, before
 * normalization. `raw_payload_hash` lets us dedup and prove provenance; the
 * full payload is stored separately (object store) keyed by this hash so any
 * message can be replayed exactly as received.
 */
export const RawMarketEvent = z.object({
  schema_version: SchemaVersion,
  /** Logical feed/connection identifier, e.g. `binance:ws:perp@btcusdt`. */
  source: Id,
  /** FK to `Venue.venue_id`. */
  venue: Id,
  /** When Aestus received the message (server clock). */
  received_at: Timestamp,
  /** Provider-stamped time, if present in the payload. */
  provider_timestamp: Timestamp.optional(),
  /** Monotonic per-source ordering token (exchange seq, or local counter). */
  sequence: z.number().int().nonnegative(),
  /** Raw event type as labeled by the source, e.g. `aggTrade`, `markPriceUpdate`. */
  event_type: z.string().min(1),
  /** Stable hash (e.g. sha256 hex) of the original payload bytes. */
  raw_payload_hash: z.string().min(1),
});
export type RawMarketEvent = z.infer<typeof RawMarketEvent>;
