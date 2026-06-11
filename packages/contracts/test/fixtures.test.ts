import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";

import {
  AssetIdentity,
  Venue,
  VenueInstrument,
  VenueQuote,
  RawMarketEvent,
  NormalizedMarketEvent,
  MacroEvent,
  NewsItem,
  OnChainEvent,
  FeatureSnapshot,
  AnomalyEvent,
  ContextPacket,
  Briefing,
  Decision,
  JournalTrade,
  HistoricalAnalogue,
} from "../src/index";

const fixturesDir = fileURLToPath(new URL("../../../fixtures", import.meta.url));

/**
 * Maps each fixture file (relative to fixtures/) to the contract its items
 * must satisfy. Every `.json` fixture must appear here — the coverage test
 * below fails CI if one is added without a contract, and per-item validation
 * fails CI on any invalid shape (P03-T015 Done-when).
 */
const FIXTURE_CONTRACTS: Record<string, z.ZodType> = {
  "assets/identities.json": AssetIdentity,
  "venues/venues.json": Venue,
  "venues/instruments.json": VenueInstrument,
  "market/venue_quotes.json": VenueQuote,
  "market/raw_events.json": RawMarketEvent,
  "market/normalized_events.json": NormalizedMarketEvent,
  "macro/events.json": MacroEvent,
  "news/items.json": NewsItem,
  "onchain/events.json": OnChainEvent,
  "features/snapshots.json": FeatureSnapshot,
  "anomalies/events.json": AnomalyEvent,
  "context/packets.json": ContextPacket,
  // Analogue records carry the HistoricalAnalogue payload plus service-internal
  // query keys (anomaly_type, regime), which the contract strips on parse.
  "analogues/analogues.json": HistoricalAnalogue,
  "briefings/briefings.json": Briefing,
  "decisions/decisions.json": Decision,
  "journal/trades.json": JournalTrade,
};

function listJsonFixtures(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json"))
        out.push(relative(fixturesDir, full).replaceAll("\\", "/"));
    }
  };
  walk(fixturesDir);
  return out;
}

describe("fixture validation", () => {
  const discovered = listJsonFixtures();

  test("every .json fixture is mapped to a contract", () => {
    const unmapped = discovered.filter((f) => !(f in FIXTURE_CONTRACTS));
    expect(unmapped).toEqual([]);
  });

  for (const [file, schema] of Object.entries(FIXTURE_CONTRACTS)) {
    test(`${file} validates against its contract`, () => {
      const raw = JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
      const items = Array.isArray(raw) ? raw : [raw];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        // .parse throws (failing CI) on any invalid shape.
        schema.parse(item);
      }
    });
  }

  test("an invalid shape is rejected (guard proves the test bites)", () => {
    expect(() => AssetIdentity.parse({ symbol: "BAD" })).toThrow();
  });
});
