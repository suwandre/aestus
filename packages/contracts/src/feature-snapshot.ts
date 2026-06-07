import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";

/** Horizon-keyed numeric map, e.g. `{ "1h": 0.012, "24h": -0.03 }`. */
const ByHorizon = z.record(z.string(), z.number());

/** Rolling correlation against another asset over a window. */
export const CorrelationEntry = z.object({
  /** FK to `AssetIdentity.canonical_id` of the other asset. */
  asset: Id,
  /** Pearson correlation, -1..1. */
  correlation: z.number().min(-1).max(1),
  /** Window label, e.g. `30d`. */
  window: z.string().min(1),
});

/** Cross-venue or spot/perp basis reading. */
export const BasisEntry = z.object({
  /** What the basis is measured against, e.g. `binance-spot`, `okx-perp`. */
  reference: z.string().min(1),
  /** Basis in basis points. */
  basis_bps: z.number(),
});

/** Deterministic regime classification (spec §113). */
export const RegimeLabels = z.object({
  trend: z.enum(["trending_up", "trending_down", "ranging", "mean_reverting"]),
  volatility: z.enum(["low", "normal", "high", "spike"]),
  risk: z.enum(["risk_on", "risk_off", "neutral"]),
});
export type RegimeLabels = z.infer<typeof RegimeLabels>;

/**
 * Rolling statistical features for one asset at a point in time. Feeds both the
 * UI feature stack (spec §113) and the deterministic anomaly engine (spec §100).
 * `funding_z`/`oi_delta`/`volume_z` are nullable — not every asset (macro
 * proxies, spot-only) has funding or open interest.
 */
export const FeatureSnapshot = z.object({
  schema_version: SchemaVersion,
  /** FK to `AssetIdentity.canonical_id`. */
  canonical_asset_id: Id,
  timestamp: Timestamp,
  /** Returns by horizon. */
  returns: ByHorizon,
  /** Realized volatility by horizon. */
  volatility: ByHorizon,
  /** Named z-scores, e.g. `{ "price": 2.1, "spread": -0.4 }`. */
  z_scores: ByHorizon,
  /** Funding-rate z-score; null when the asset has no funding. */
  funding_z: z.number().nullable(),
  /** Open-interest delta (fraction or absolute); null when no OI. */
  oi_delta: z.number().nullable(),
  /** Volume z-score; null when not computable. */
  volume_z: z.number().nullable(),
  correlation_set: z.array(CorrelationEntry).default([]),
  basis: z.array(BasisEntry).default([]),
  regime: RegimeLabels,
});
export type FeatureSnapshot = z.infer<typeof FeatureSnapshot>;
