import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";
import { AnomalyEvent } from "./anomaly";
import { FeatureSnapshot } from "./feature-snapshot";
import { NewsItem } from "./news";
import { MacroEvent } from "./macro";
import { OnChainEvent } from "./onchain";
import { DeterministicLevels } from "./levels";

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
  news: z.array(NewsItem).default([]),
  macro: z.array(MacroEvent).default([]),
  on_chain: z.array(OnChainEvent).default([]),
  historical_analogues: z.array(HistoricalAnalogue).default([]),
  /** Code-computed price levels (hard rule #2). */
  deterministic_levels: DeterministicLevels,
});
export type ContextPacket = z.infer<typeof ContextPacket>;
