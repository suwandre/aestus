import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";
import { Side } from "./normalized-event";
import { RegimeLabels } from "./feature-snapshot";

/** One side of a trade — fill price and time. */
export const TradeLeg = z.object({
  price: z.number(),
  at: Timestamp,
});
export type TradeLeg = z.infer<typeof TradeLeg>;

/** Trade result classification. `open` until the position is closed. */
export const OutcomeStatus = z.enum(["open", "win", "loss", "breakeven"]);
export type OutcomeStatus = z.infer<typeof OutcomeStatus>;

/**
 * A journaled trade across its lifecycle. Shaped for later analytics sliced by
 * setup (`setup_tags`), regime (`regime_at_entry`), and signal (`signal`).
 * `exit`/`realized_pnl`/`r_multiple` are null while the trade is open. Aestus
 * records trades; it never executes them (hard rule #1).
 */
export const JournalTrade = z.object({
  id: Id,
  schema_version: SchemaVersion,
  /** FK to `AssetIdentity.canonical_id`. */
  canonical_asset_id: Id,
  side: Side,
  entry: TradeLeg,
  /** Null while the position is open. */
  exit: TradeLeg.nullable(),
  /** Position size in base-asset units. */
  size: z.number().positive(),
  /** Total fees paid in quote currency. */
  fees: z.number().nonnegative(),
  /** Realized PnL in quote currency; null while open. */
  realized_pnl: z.number().nullable(),
  /** Result in R multiples; null while open. */
  r_multiple: z.number().nullable(),
  outcome_status: OutcomeStatus,
  /** Setup classification for analytics, e.g. `trend-follow`, `mean-revert`. */
  setup_tags: z.array(z.string()).default([]),
  /** Regime at entry — enables analytics by regime. */
  regime_at_entry: RegimeLabels.optional(),
  /** Triggering signal/anomaly type — enables analytics by signal. */
  signal: z.string().optional(),
  /** FK to the originating `Briefing.id`; null for manual trades. */
  linked_briefing_id: Id.nullable(),
});
export type JournalTrade = z.infer<typeof JournalTrade>;
