import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";
import { AnomalyEvent } from "./anomaly";
import { FeatureSnapshot } from "./feature-snapshot";
import { NewsItem } from "./news";
import { MacroEvent } from "./macro";
import { OnChainEvent } from "./onchain";
import { DeterministicLevels } from "./levels";
import { VenueQuote } from "./venue-quote";

/**
 * Cross-venue comparison for the primary asset (P11-T004). Quotes are gathered
 * per venue; dispersion metrics and `is_venue_specific` let the briefing
 * explain whether a dislocation is isolated to one venue or market-wide.
 */
export const VenueComparison = z.object({
  /** FK to `AssetIdentity.canonical_id` the comparison is for. */
  asset: Id,
  quotes: z.array(VenueQuote).default([]),
  /** Funding-rate spread across venues (max − min); null if <2 have funding. */
  funding_dispersion: z.number().nullable(),
  /** Basis spread across venues in bps (max − min); null if <2 have basis. */
  basis_dispersion_bps: z.number().nullable(),
  /** Price spread across venues as a fraction of the mean; null if <2 priced. */
  price_dispersion: z.number().nullable(),
  /** Venue whose readings diverge most from the median, if any. */
  outlier_venue: Id.nullable(),
  /** True when dispersion crosses the venue-specific threshold. */
  is_venue_specific: z.boolean(),
  /** Human-readable explanation of the cross-venue picture. */
  notes: z.string(),
});
export type VenueComparison = z.infer<typeof VenueComparison>;

/** A prior situation resembling the current one, for analogue reasoning. */
export const HistoricalAnalogue = z.object({
  /** When the analogue occurred (timestamp or period label). */
  when: z.string().min(1),
  description: z.string().min(1),
  /** Similarity score 0..1. */
  similarity: z.number().min(0).max(1),
  /** What happened next, if known. */
  outcome: z.string().optional(),
});
export type HistoricalAnalogue = z.infer<typeof HistoricalAnalogue>;

/**
 * Everything the LLM needs to draft a briefing — assembled deterministically.
 * This is the sole input to briefing generation (T011): the trigger anomaly,
 * the primary asset's feature snapshot, correlated assets, and the news /
 * macro / on-chain context, plus code-computed deterministic levels. The LLM
 * supplies narrative; it never sees raw feeds, only this packet.
 */
export const ContextPacket = z.object({
  id: Id,
  schema_version: SchemaVersion,
  generated_at: Timestamp,
  /** FK to `AssetIdentity.canonical_id` the packet centers on. */
  primary_asset: Id,
  /** The anomaly that triggered packet assembly. */
  trigger: AnomalyEvent,
  /** Current feature snapshot for the primary asset. */
  market_snapshot: FeatureSnapshot,
  /** Feature snapshots for correlated assets. */
  correlated_assets: z.array(FeatureSnapshot).default([]),
  /** Cross-venue comparison for the primary asset (T004); absent if unavailable. */
  venue_comparison: VenueComparison.optional(),
  news: z.array(NewsItem).default([]),
  macro: z.array(MacroEvent).default([]),
  on_chain: z.array(OnChainEvent).default([]),
  historical_analogues: z.array(HistoricalAnalogue).default([]),
  /** Code-computed price levels (hard rule #2). */
  deterministic_levels: DeterministicLevels,
});
export type ContextPacket = z.infer<typeof ContextPacket>;
