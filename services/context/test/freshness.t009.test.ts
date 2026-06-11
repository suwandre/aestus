import { describe, expect, test } from "bun:test";
import type { AnomalyEvent, ContextPacket, FeedKind, SourceFreshness } from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { assembleContextPacket } from "../src/builder";

const config = loadConfig();
const ds = new FixtureDataSource(config);

const trigger: AnomalyEvent = {
  id: "anom-001",
  type: "funding_spike",
  severity: "high",
  sigma: 2.6,
  assets: ["crypto:btc-usdt"],
  venues: ["binance"],
  title: "BTC funding rate spike",
  description: "Funding z-score reached 2.6.",
  detected_at: "2026-06-07T12:00:00.000Z",
  status: "active",
  context_refs: [],
};

const byFeed = (packet: ContextPacket): Map<FeedKind, SourceFreshness> =>
  new Map(packet.source_freshness.map((f) => [f.feed, f] as const));

describe("P11-T009 source freshness summary", () => {
  test("reports one entry per feed contributing to a packet", () => {
    const packet = assembleContextPacket(trigger, { dataSource: ds });
    const feeds = [...packet.source_freshness.map((f) => f.feed)].sort();
    const expected: FeedKind[] = [
      "correlated_assets",
      "macro",
      "market_snapshot",
      "news",
      "on_chain",
      "venue_quotes",
    ];
    expect(feeds).toEqual(expected.sort());
  });

  test("marks fresh feeds fresh and old feeds stale relative to generation time", () => {
    // Generate 60s after the BTC snapshot: market is fresh, the 12h-old
    // on-chain event is stale at the default 900s threshold.
    const packet = assembleContextPacket(trigger, {
      dataSource: ds,
      now: () => new Date("2026-06-07T12:01:00.000Z"),
      freshnessStaleSeconds: 900,
    });
    const f = byFeed(packet);
    const market = f.get("market_snapshot")!;
    expect(market.present).toBe(true);
    expect(market.age_seconds).toBe(60);
    expect(market.stale).toBe(false);

    const onChain = f.get("on_chain")!;
    expect(onChain.present).toBe(true);
    expect(onChain.stale).toBe(true); // ~12h old > 900s
  });

  test("absent feed is reported missing (present=false, stale=true), not hidden", () => {
    // No venue thresholds configured → no venue comparison is built, so the
    // venue_quotes feed contributes nothing.
    const packet = assembleContextPacket(trigger, { dataSource: ds });
    const venue = byFeed(packet).get("venue_quotes")!;
    expect(venue.present).toBe(false);
    expect(venue.latest_at).toBeNull();
    expect(venue.age_seconds).toBeNull();
    expect(venue.stale).toBe(true);
  });

  test("a feed with no data source at all is reported missing", () => {
    const packet = assembleContextPacket(trigger); // no dataSource
    for (const entry of packet.source_freshness) {
      expect(entry.present).toBe(false);
      expect(entry.stale).toBe(true);
    }
  });
});
