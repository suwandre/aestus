/**
 * Context packet assembly (P11-T001 skeleton).
 *
 * Turns a trigger `AnomalyEvent` into a schema-valid {@link ContextPacket}.
 * At T001 every data section is a placeholder; subsequent P11 tasks replace
 * each placeholder with a real deterministic query (market snapshot, correlated
 * assets, venues, news, macro, on-chain, analogues). Ids/timestamps are
 * injectable so fixtures and tests stay deterministic.
 */
import {
  type AnomalyEvent,
  type ContextPacket,
  type FeatureSnapshot,
  type FeedKind,
  type MacroImportance,
  SCHEMA_VERSION,
  type SourceFreshness,
} from "@aestus/contracts";
import { placeholderLevels } from "./levels";
import { computePacketQuality } from "./quality";
import type { ContextDataSource } from "./data/source";
import { buildVenueComparison, type VenueThresholds } from "./venue";
import { computeLevels } from "./level-engine";

/** Map anomaly severity to a deterministic setup-confidence for sizing (T011). */
const SEVERITY_CONFIDENCE: Record<string, number> = {
  low: 0.3,
  medium: 0.5,
  high: 0.7,
  critical: 0.85,
};

export interface BuildOptions {
  /** Clock for `generated_at`. Defaults to the current time. */
  now?: () => Date;
  /** Packet id from the trigger. Defaults to `ctx:<trigger.id>`. */
  idFor?: (trigger: AnomalyEvent) => string;
  /** Source for market/news/macro/on-chain state; placeholders used if absent. */
  dataSource?: ContextDataSource;
  /** Canonical asset ids to include as correlated-asset context (T003). */
  correlatedAssets?: string[];
  /** Thresholds for the venue-specific dislocation decision (T004). */
  venueThresholds?: VenueThresholds;
  /** News look-back window in minutes (T005). */
  newsWindowMinutes?: number;
  /** Minimum news relevance to include (T005). */
  newsMinRelevance?: number;
  /** Macro window half-width in hours (T006). */
  macroWindowHours?: number;
  /** Lowest macro importance to include (T006). */
  macroMinImportance?: MacroImportance;
  /** On-chain look-back window in hours (T007). */
  onChainWindowHours?: number;
  /** Maximum number of historical analogues to include (T008). */
  analogueLimit?: number;
  /** Seconds after which a contributing feed is considered stale (T009). */
  freshnessStaleSeconds?: number;
}

/**
 * Freshness of one feed at packet generation. `latest` is the newest
 * contributing item's timestamp (or null when the feed is absent); a feed is
 * stale when it is missing or its latest item is older than `staleSeconds`.
 * Future timestamps (e.g. an upcoming macro event) clamp to age 0 — fresh.
 */
function freshnessFor(
  feed: FeedKind,
  latest: string | null,
  generatedAtMs: number,
  staleSeconds: number,
): SourceFreshness {
  if (latest === null) {
    return { feed, present: false, latest_at: null, age_seconds: null, stale: true };
  }
  const ageSeconds = Math.max(0, Math.round((generatedAtMs - Date.parse(latest)) / 1000));
  return {
    feed,
    present: true,
    latest_at: latest,
    age_seconds: ageSeconds,
    stale: ageSeconds > staleSeconds,
  };
}

/** Newest timestamp (by `key`) among `items`, or null when empty. */
function newestTimestamp<T>(items: T[], key: (item: T) => string): string | null {
  let newest: string | null = null;
  for (const item of items) {
    const ts = key(item);
    if (newest === null || Date.parse(ts) > Date.parse(newest)) newest = ts;
  }
  return newest;
}

/** A neutral, schema-valid placeholder snapshot for an asset at a timestamp. */
export function placeholderSnapshot(asset: string, timestamp: string): FeatureSnapshot {
  return {
    schema_version: SCHEMA_VERSION,
    canonical_asset_id: asset,
    timestamp,
    returns: {},
    volatility: {},
    z_scores: {},
    funding_z: null,
    oi_delta: null,
    volume_z: null,
    correlation_set: [],
    basis: [],
    regime: { trend: "ranging", volatility: "normal", risk: "neutral" },
  };
}

/** Assemble a (currently placeholder) context packet for a trigger anomaly. */
export function assembleContextPacket(
  trigger: AnomalyEvent,
  opts: BuildOptions = {},
): ContextPacket {
  const now = opts.now ?? (() => new Date());
  const idFor = opts.idFor ?? ((t) => `ctx:${t.id}`);
  const primaryAsset = trigger.assets[0]!;

  // Current market state for the trigger asset (T002): the real feature
  // snapshot when available, otherwise a neutral placeholder. We track whether
  // the snapshot is real so freshness (T009) reports a placeholder as missing.
  const realSnapshot = opts.dataSource?.featureSnapshot(primaryAsset);
  const marketSnapshot = realSnapshot ?? placeholderSnapshot(primaryAsset, trigger.detected_at);

  // Cross-asset context (T003): current snapshots for configured correlated
  // assets (e.g. ETH, SPX, DXY, GOLD, VIX), excluding the primary asset.
  const correlatedAssets =
    opts.dataSource?.correlatedSnapshots(primaryAsset, opts.correlatedAssets ?? []) ?? [];

  // Cross-venue comparison (T004): explains whether a dislocation is isolated
  // to one venue or market-wide. Omitted when no venue quotes are available.
  const quotes = opts.dataSource?.venueQuotes(primaryAsset) ?? [];
  const venueComparison =
    quotes.length > 0 && opts.venueThresholds
      ? buildVenueComparison(primaryAsset, quotes, opts.venueThresholds)
      : undefined;

  // Recent, relevant news for the anomaly assets (T005).
  const news =
    opts.dataSource?.news({
      assets: trigger.assets,
      before: trigger.detected_at,
      windowMinutes: opts.newsWindowMinutes ?? 240,
      minRelevance: opts.newsMinRelevance ?? 0.5,
    }) ?? [];

  // Macro events around the anomaly time (T006) — surfaces CPI/FOMC/NFP nearness.
  const macro =
    opts.dataSource?.macro({
      around: trigger.detected_at,
      windowHours: opts.macroWindowHours ?? 72,
      minImportance: opts.macroMinImportance ?? "medium",
    }) ?? [];

  // Recent on-chain context (T007): asset flows/whale moves + market-wide stablecoin.
  const onChain =
    opts.dataSource?.onChain({
      assets: trigger.assets,
      before: trigger.detected_at,
      windowHours: opts.onChainWindowHours ?? 48,
    }) ?? [];

  // Historical analogues (T008): prior situations of the same anomaly type,
  // ranked by how closely their regime matches the current one. An empty array
  // is the explicit "insufficient history" signal — no silent omission.
  const historicalAnalogues =
    opts.dataSource?.historicalAnalogues({
      anomalyType: trigger.type,
      regime: marketSnapshot.regime,
      limit: opts.analogueLimit ?? 3,
    }) ?? [];

  // Per-feed freshness (T009): one entry per feed so the UI can show a stale
  // badge or name a missing feed, never hiding a dead feed behind numbers.
  const generatedAt = now();
  const generatedAtMs = generatedAt.getTime();
  const staleSeconds = opts.freshnessStaleSeconds ?? 900;
  const sourceFreshness: SourceFreshness[] = [
    freshnessFor(
      "market_snapshot",
      realSnapshot ? realSnapshot.timestamp : null,
      generatedAtMs,
      staleSeconds,
    ),
    freshnessFor(
      "correlated_assets",
      newestTimestamp(correlatedAssets, (s) => s.timestamp),
      generatedAtMs,
      staleSeconds,
    ),
    freshnessFor(
      // Reflects the packet's venue_comparison section: present only when the
      // comparison was actually built (raw quotes alone aren't surfaced).
      "venue_quotes",
      venueComparison ? newestTimestamp(venueComparison.quotes, (q) => q.timestamp) : null,
      generatedAtMs,
      staleSeconds,
    ),
    freshnessFor(
      "news",
      newestTimestamp(news, (n) => n.published_at),
      generatedAtMs,
      staleSeconds,
    ),
    freshnessFor(
      "macro",
      newestTimestamp(macro, (m) => m.scheduled_at),
      generatedAtMs,
      staleSeconds,
    ),
    freshnessFor(
      "on_chain",
      newestTimestamp(onChain, (e) => e.timestamp),
      generatedAtMs,
      staleSeconds,
    ),
  ];

  // Deterministic levels (P12): compute real levels from OHLCV candles +
  // liquidation clusters when available, else an explicit placeholder. The
  // packet carries the full `derivations` audit trail so a user can inspect why
  // each numeric level exists (T011); the LLM may only cite these, never invent
  // levels (hard rule #2).
  const candles = opts.dataSource?.candles(primaryAsset) ?? [];
  const deterministicLevels =
    candles.length > 0
      ? computeLevels({
          asset: primaryAsset,
          candles,
          liquidationClusters: opts.dataSource?.liquidationClusters(primaryAsset) ?? [],
          regimeTrend: marketSnapshot.regime.trend,
          confidence: SEVERITY_CONFIDENCE[trigger.severity] ?? 0.5,
        })
      : placeholderLevels();

  return {
    id: idFor(trigger),
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt.toISOString(),
    primary_asset: primaryAsset,
    trigger,
    market_snapshot: marketSnapshot,
    correlated_assets: correlatedAssets,
    ...(venueComparison ? { venue_comparison: venueComparison } : {}),
    news,
    macro,
    on_chain: onChain,
    historical_analogues: historicalAnalogues,
    source_freshness: sourceFreshness,
    // Completeness/quality from feed presence + freshness (T012).
    quality: computePacketQuality(sourceFreshness),
    deterministic_levels: deterministicLevels,
  };
}
