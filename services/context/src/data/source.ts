/**
 * Data-source abstraction for context assembly.
 *
 * The context builder reads market/news/macro/on-chain state through this
 * interface so it never touches a concrete store directly. The fixture-backed
 * implementation ({@link ./fixtures.FixtureDataSource}) satisfies it for
 * fixture-first dev/tests (hard rule #5); a live Redis/Postgres/ClickHouse
 * implementation can be added later without changing the builder. Methods are
 * added as P11 tasks need them.
 */
import type { FeatureSnapshot, NewsItem, VenueQuote } from "@aestus/contracts";

/** Window/relevance filter for news retrieval (T005). */
export interface NewsQuery {
  /** Canonical asset ids / entities to match against `NewsItem.entities`. */
  assets: string[];
  /** Anomaly time; only news at or before this is "recent". */
  before: string;
  /** Look-back window in minutes. */
  windowMinutes: number;
  /** Minimum relevance score to include. */
  minRelevance: number;
}

export interface ContextDataSource {
  /** Latest feature snapshot (current market state) for an asset, if known. */
  featureSnapshot(asset: string): FeatureSnapshot | undefined;

  /**
   * Current snapshots for the configured correlated assets (T003), excluding
   * `exclude` (the primary asset). Assets with no snapshot are omitted.
   */
  correlatedSnapshots(exclude: string, assets: string[]): FeatureSnapshot[];

  /** Latest per-venue quotes for an asset (T004); empty if none known. */
  venueQuotes(asset: string): VenueQuote[];

  /**
   * Recent, relevant news for the query's assets (T005): matched by entity,
   * within the look-back window, at/above the relevance floor. Sorted by
   * relevance descending.
   */
  news(query: NewsQuery): NewsItem[];
}
