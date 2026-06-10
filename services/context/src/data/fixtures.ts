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
  type VenueQuote,
  VenueQuote as VenueQuoteSchema,
} from "@aestus/contracts";
import type { ContextConfig } from "../config";
import type { ContextDataSource } from "./source";

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
}
