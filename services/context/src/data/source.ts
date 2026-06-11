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
import type {
  FeatureSnapshot,
  HistoricalAnalogue,
  MacroEvent,
  MacroImportance,
  NewsItem,
  OnChainEvent,
  RegimeLabels,
  VenueQuote,
} from "@aestus/contracts";
import type { Candle, LiquidationCluster } from "../level-engine/types";

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

  /**
   * Macro calendar events around the anomaly time (T006): both upcoming and
   * recent, within `windowHours` either side, at/above `minImportance`. Sorted
   * by proximity to the anomaly time so CPI/FOMC/NFP nearness surfaces first.
   */
  macro(query: MacroQuery): MacroEvent[];

  /**
   * Recent on-chain events (T007): exchange flows / whale transfers for the
   * query's assets, plus market-wide stablecoin mint/burn context, within the
   * look-back window. Sorted most-recent first.
   */
  onChain(query: OnChainQuery): OnChainEvent[];

  /**
   * Prior situations resembling the current anomaly (T008): matched by anomaly
   * type, ranked so those whose market regime aligns with the current regime
   * surface first, then by similarity. Capped at `query.limit`. An empty array
   * is the explicit "insufficient history" signal — no sufficiently-similar
   * prior situation exists for this anomaly type. History is fixture-backed
   * until a live ClickHouse/Postgres source is wired in.
   */
  historicalAnalogues(query: AnalogueQuery): HistoricalAnalogue[];

  /**
   * Recent OHLCV candles for an asset (single timeframe, oldest→newest) — the
   * level engine's structural input (P12-T011). Empty when none are known, in
   * which case the builder falls back to placeholder levels (fixture-first).
   */
  candles(asset: string): Candle[];

  /** Known liquidation clusters for an asset (P12-T011); empty if none. */
  liquidationClusters(asset: string): LiquidationCluster[];
}

/** Anomaly-type / regime filter for historical-analogue retrieval (T008). */
export interface AnalogueQuery {
  /** The trigger anomaly's type to match prior situations against. */
  anomalyType: string;
  /** Current market regime; used to rank type-matched analogues by closeness. */
  regime: RegimeLabels;
  /** Maximum number of analogues to return. */
  limit: number;
}

/** Window/importance filter for macro retrieval (T006). */
export interface MacroQuery {
  /** Anomaly time the window centers on. */
  around: string;
  /** Half-window in hours (applied both before and after). */
  windowHours: number;
  /** Lowest importance to include. */
  minImportance: MacroImportance;
}

/** Window/asset filter for on-chain retrieval (T007). */
export interface OnChainQuery {
  /** Canonical asset ids to match against `OnChainEvent.asset`. */
  assets: string[];
  /** Anomaly time; only events at or before this are "recent". */
  before: string;
  /** Look-back window in hours. */
  windowHours: number;
}
