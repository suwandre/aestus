import { z } from "zod/v4";
import { Id, Timestamp } from "./common";

/**
 * One OHLCV candle for a single timeframe bucket — the typed input to the
 * deterministic level engine (P12) for ATR, swing structure, and S/R, and the
 * shape the ClickHouse aggregate tables (P04-T013) materialize. Prices are kept
 * as numbers here (fixture/transport); precision-sensitive math is the engine's
 * responsibility. Candles for an asset are ordered oldest→newest by `time`.
 */
export const Ohlcv = z.object({
  /** FK to `AssetIdentity.canonical_id`. */
  canonical_asset_id: Id,
  /** Timeframe label, e.g. `1m`, `5m`, `1h`. */
  timeframe: z.string().min(1),
  /** Bucket open time. */
  time: Timestamp,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nonnegative(),
});
export type Ohlcv = z.infer<typeof Ohlcv>;
