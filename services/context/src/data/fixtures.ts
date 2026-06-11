/**
 * Fixture-backed {@link ContextDataSource} (P11-T002+).
 *
 * Loads the repo's JSON fixtures once (lazily, then cached) and validates each
 * item against its contract on load, so a malformed fixture fails loudly rather
 * than producing a silently-wrong packet. This is the default data source for
 * fixture-first dev and tests; a live source can implement the same interface.
 */
import { readFileSync } from "node:fs";
import { z } from "zod/v4";
import {
  type FeatureSnapshot,
  FeatureSnapshot as FeatureSnapshotSchema,
  HistoricalAnalogue as HistoricalAnalogueSchema,
  type HistoricalAnalogue,
  type MacroEvent,
  MacroEvent as MacroEventSchema,
  type MacroImportance,
  type NewsItem,
  NewsItem as NewsItemSchema,
  type OnChainEvent,
  OnChainEvent as OnChainEventSchema,
  RegimeLabels as RegimeLabelsSchema,
  type RegimeLabels,
  type VenueQuote,
  VenueQuote as VenueQuoteSchema,
} from "@aestus/contracts";
import type { ContextConfig } from "../config";
import type {
  AnalogueQuery,
  ContextDataSource,
  MacroQuery,
  NewsQuery,
  OnChainQuery,
} from "./source";

/** Importance ordering for "at least this important" filtering. */
const IMPORTANCE_RANK: Record<MacroImportance, number> = { low: 0, medium: 1, high: 2 };

/**
 * Fixture shape for a stored historical analogue: a {@link HistoricalAnalogue}
 * payload plus the keys it is retrieved by (anomaly type and the regime it
 * occurred in). The query keys live only in the fixture, not in the emitted
 * packet — the packet carries plain `HistoricalAnalogue`s.
 */
const AnalogueRecordSchema = HistoricalAnalogueSchema.extend({
  anomaly_type: z.string().min(1),
  regime: RegimeLabelsSchema,
});
type AnalogueRecord = z.infer<typeof AnalogueRecordSchema>;

/** Count of regime dimensions (trend/volatility/risk) shared by two regimes. */
function regimeMatchCount(a: RegimeLabels, b: RegimeLabels): number {
  let n = 0;
  if (a.trend === b.trend) n += 1;
  if (a.volatility === b.volatility) n += 1;
  if (a.risk === b.risk) n += 1;
  return n;
}

/** Parse a JSON fixture file as an array validated against `schema`. */
function loadArray<T>(path: string, schema: z.ZodType<T>): T[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((item) => schema.parse(item));
}

export class FixtureDataSource implements ContextDataSource {
  private readonly config: ContextConfig;
  private featuresCache?: FeatureSnapshot[];
  private venueQuotesCache?: VenueQuote[];
  private newsCache?: NewsItem[];
  private macroCache?: MacroEvent[];
  private onChainCache?: OnChainEvent[];
  private analoguesCache?: AnalogueRecord[];

  constructor(config: ContextConfig) {
    this.config = config;
  }

  /** All feature snapshots, loaded and cached on first access. */
  private features(): FeatureSnapshot[] {
    if (!this.featuresCache) {
      this.featuresCache = loadArray(this.config.fixtures.features, FeatureSnapshotSchema);
    }
    return this.featuresCache;
  }

  featureSnapshot(asset: string): FeatureSnapshot | undefined {
    // Latest snapshot for the asset by timestamp (fixtures are small).
    const matches = this.features().filter((s) => s.canonical_asset_id === asset);
    if (matches.length === 0) return undefined;
    return matches.reduce((latest, s) =>
      Date.parse(s.timestamp) > Date.parse(latest.timestamp) ? s : latest,
    );
  }

  correlatedSnapshots(exclude: string, assets: string[]): FeatureSnapshot[] {
    const out: FeatureSnapshot[] = [];
    for (const asset of assets) {
      if (asset === exclude) continue;
      const snap = this.featureSnapshot(asset);
      if (snap) out.push(snap);
    }
    return out;
  }

  private venueQuotesAll(): VenueQuote[] {
    if (!this.venueQuotesCache) {
      this.venueQuotesCache = loadArray(this.config.fixtures.venueQuotes, VenueQuoteSchema);
    }
    return this.venueQuotesCache;
  }

  venueQuotes(asset: string): VenueQuote[] {
    // Latest quote per venue for the asset.
    const byVenue = new Map<string, VenueQuote>();
    for (const q of this.venueQuotesAll()) {
      if (q.canonical_asset_id !== asset) continue;
      const prev = byVenue.get(q.venue);
      if (!prev || Date.parse(q.timestamp) > Date.parse(prev.timestamp)) byVenue.set(q.venue, q);
    }
    return [...byVenue.values()];
  }

  private newsAll(): NewsItem[] {
    if (!this.newsCache) {
      this.newsCache = loadArray(this.config.fixtures.news, NewsItemSchema);
    }
    return this.newsCache;
  }

  news(query: NewsQuery): NewsItem[] {
    const before = Date.parse(query.before);
    const earliest = before - query.windowMinutes * 60_000;
    const wanted = new Set(query.assets);
    return this.newsAll()
      .filter((n) => {
        if (n.relevance_score < query.minRelevance) return false;
        const published = Date.parse(n.published_at);
        if (published > before || published < earliest) return false;
        return n.entities.some((e) => wanted.has(e));
      })
      .sort((a, b) => b.relevance_score - a.relevance_score);
  }

  private macroAll(): MacroEvent[] {
    if (!this.macroCache) {
      this.macroCache = loadArray(this.config.fixtures.macro, MacroEventSchema);
    }
    return this.macroCache;
  }

  macro(query: MacroQuery): MacroEvent[] {
    const center = Date.parse(query.around);
    const windowMs = query.windowHours * 3_600_000;
    const floor = IMPORTANCE_RANK[query.minImportance];
    return this.macroAll()
      .filter((m) => {
        if (IMPORTANCE_RANK[m.importance] < floor) return false;
        return Math.abs(Date.parse(m.scheduled_at) - center) <= windowMs;
      })
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.scheduled_at) - center) -
          Math.abs(Date.parse(b.scheduled_at) - center),
      );
  }

  private onChainAll(): OnChainEvent[] {
    if (!this.onChainCache) {
      this.onChainCache = loadArray(this.config.fixtures.onChain, OnChainEventSchema);
    }
    return this.onChainCache;
  }

  onChain(query: OnChainQuery): OnChainEvent[] {
    const before = Date.parse(query.before);
    const earliest = before - query.windowHours * 3_600_000;
    const wanted = new Set(query.assets);
    return this.onChainAll()
      .filter((e) => {
        const ts = Date.parse(e.timestamp);
        if (ts > before || ts < earliest) return false;
        // Asset-specific flows/whale moves, plus market-wide stablecoin context.
        return wanted.has(e.asset) || e.event_type === "stablecoin_mint_burn";
      })
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }

  private analoguesAll(): AnalogueRecord[] {
    if (!this.analoguesCache) {
      this.analoguesCache = loadArray(this.config.fixtures.analogues, AnalogueRecordSchema);
    }
    return this.analoguesCache;
  }

  historicalAnalogues(query: AnalogueQuery): HistoricalAnalogue[] {
    return (
      this.analoguesAll()
        .filter((r) => r.anomaly_type === query.anomalyType)
        .sort((a, b) => {
          // Regime-aligned analogues first, then higher similarity.
          const byRegime =
            regimeMatchCount(b.regime, query.regime) - regimeMatchCount(a.regime, query.regime);
          return byRegime !== 0 ? byRegime : b.similarity - a.similarity;
        })
        .slice(0, query.limit)
        // Strip the fixture-only query keys; emit plain HistoricalAnalogues.
        .map(({ anomaly_type: _type, regime: _regime, ...analogue }) => analogue)
    );
  }
}
