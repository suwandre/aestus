import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";

/** Aggressor / liquidation side. */
export const Side = z.enum(["buy", "sell"]);
export type Side = z.infer<typeof Side>;

/**
 * Fields shared by every normalized event. Prices and sizes are numbers:
 * normalization is the point at which exact provider decimals become numeric
 * inputs for deterministic feature math. Exact original bytes remain
 * replayable via the matching `RawMarketEvent.raw_payload_hash`.
 */
const Base = z.object({
  schema_version: SchemaVersion,
  /** FK to `Venue.venue_id`. */
  venue: Id,
  /** Venue-native instrument symbol. */
  instrument_id: Id,
  /** FK to `AssetIdentity.canonical_id`. */
  canonical_asset_id: Id,
  /** Event time (provider time when known, else receipt time). */
  timestamp: Timestamp,
  /** Monotonic per-source ordering token carried from the raw envelope. */
  sequence: z.number().int().nonnegative().optional(),
});

const PriceTick = Base.extend({
  event_type: z.literal("price_tick"),
  price: z.number(),
  bid: z.number().optional(),
  ask: z.number().optional(),
});

const Trade = Base.extend({
  event_type: z.literal("trade"),
  price: z.number(),
  size: z.number().nonnegative(),
  side: Side,
  trade_id: z.string().optional(),
});

const OrderbookDelta = Base.extend({
  event_type: z.literal("orderbook_delta"),
  /** `[price, size]` levels; size 0 removes the level. */
  bids: z.array(z.tuple([z.number(), z.number()])),
  asks: z.array(z.tuple([z.number(), z.number()])),
  is_snapshot: z.boolean().default(false),
});

const FundingRate = Base.extend({
  event_type: z.literal("funding_rate"),
  funding_rate: z.number(),
  next_funding_time: Timestamp.optional(),
  /** Funding interval in hours, e.g. 8. */
  interval_hours: z.number().positive().optional(),
});

const OpenInterest = Base.extend({
  event_type: z.literal("open_interest"),
  /** OI in base-asset units. */
  open_interest: z.number().nonnegative(),
  /** OI notional in quote currency, if provided. */
  notional: z.number().nonnegative().optional(),
});

const Liquidation = Base.extend({
  event_type: z.literal("liquidation"),
  side: Side,
  price: z.number(),
  size: z.number().nonnegative(),
});

const MarkPrice = Base.extend({
  event_type: z.literal("mark_price"),
  mark_price: z.number(),
});

const IndexPrice = Base.extend({
  event_type: z.literal("index_price"),
  index_price: z.number(),
});

/** Discriminated union of all normalized market event variants. */
export const NormalizedMarketEvent = z.discriminatedUnion("event_type", [
  PriceTick,
  Trade,
  OrderbookDelta,
  FundingRate,
  OpenInterest,
  Liquidation,
  MarkPrice,
  IndexPrice,
]);
export type NormalizedMarketEvent = z.infer<typeof NormalizedMarketEvent>;
