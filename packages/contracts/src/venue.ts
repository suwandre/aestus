import { z } from "zod/v4";
import { Id } from "./common";

/** How an instrument trades on a venue. `macro_proxy` covers non-exchange feeds. */
export const MarketType = z.enum(["perp", "spot", "futures", "option", "macro_proxy"]);
export type MarketType = z.infer<typeof MarketType>;

/** A data source / exchange Aestus ingests from. */
export const Venue = z.object({
  /** Stable venue key, e.g. `binance`, `bybit`, `hyperliquid`, `okx`, `macro`. */
  venue_id: Id,
  display_name: z.string().min(1),
  /** Market types this venue exposes. */
  market_types: z.array(MarketType).min(1),
});
export type Venue = z.infer<typeof Venue>;

/**
 * A tradeable instrument on a specific venue, linked to a canonical asset.
 * `tick_size`/`lot_size` are strings to preserve exact decimal precision.
 */
export const VenueInstrument = z.object({
  venue_id: Id,
  market_type: MarketType,
  /** Venue-native instrument symbol, e.g. `BTCUSDT`, `BTC-PERP`, `BTC`. */
  instrument_id: Id,
  /** FK to `AssetIdentity.canonical_id`. */
  canonical_asset_id: Id,
  /** Minimum price increment, e.g. `0.1`. */
  tick_size: z.string().min(1),
  /** Minimum order/size increment, e.g. `0.001`. */
  lot_size: z.string().min(1),
  quote_currency: z.string().min(1),
});
export type VenueInstrument = z.infer<typeof VenueInstrument>;
