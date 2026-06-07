import { z } from "zod/v4";
import { AssetClass, Id } from "./common";

/**
 * Canonical identity for any tracked asset — crypto trading pairs as well as
 * macro proxies (SPX, DXY, GOLD, VIX). `base`/`quote` are optional because
 * non-pair instruments (indices, single commodities, volatility gauges) have
 * no meaningful pair decomposition.
 */
export const AssetIdentity = z.object({
  /** Venue-agnostic trading symbol, e.g. `BTCUSDT`, `SPX`, `VIX`. */
  symbol: z.string().min(1),
  /** Base asset for a pair, e.g. `BTC`. Absent for indices/commodities. */
  base: z.string().min(1).optional(),
  /** Quote asset for a pair, e.g. `USDT`. Absent for indices/commodities. */
  quote: z.string().min(1).optional(),
  asset_class: AssetClass,
  /** Stable internal id used as a foreign key everywhere, e.g. `crypto:btc-usdt`. */
  canonical_id: Id,
  display_name: z.string().min(1),
  /** UI icon lookup key, e.g. `btc`, `spx`. */
  icon_key: z.string().min(1),
  tags: z.array(z.string()).default([]),
});
export type AssetIdentity = z.infer<typeof AssetIdentity>;
