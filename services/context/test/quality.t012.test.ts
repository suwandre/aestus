import { describe, expect, test } from "bun:test";
import type { AnomalyEvent, SourceFreshness } from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { assembleContextPacket } from "../src/builder";
import { computePacketQuality } from "../src/quality";

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

const fresh = (feed: SourceFreshness["feed"]): SourceFreshness => ({
  feed,
  present: true,
  latest_at: "2026-06-07T12:00:00.000Z",
  age_seconds: 5,
  stale: false,
});
const stale = (feed: SourceFreshness["feed"]): SourceFreshness => ({
  ...fresh(feed),
  age_seconds: 99999,
  stale: true,
});
const missing = (feed: SourceFreshness["feed"]): SourceFreshness => ({
  feed,
  present: false,
  latest_at: null,
  age_seconds: null,
  stale: true,
});

const ALL_FEEDS: SourceFreshness["feed"][] = [
  "market_snapshot",
  "correlated_assets",
  "venue_quotes",
  "news",
  "macro",
  "on_chain",
];

describe("P11-T012 packet quality score", () => {
  test("all feeds fresh → score 1, strong, no degraded feeds", () => {
    const q = computePacketQuality(ALL_FEEDS.map(fresh));
    expect(q.score).toBe(1);
    expect(q.label).toBe("strong");
    expect(q.degraded_feeds).toEqual([]);
  });

  test("missing the primary market snapshot drops to the adequate boundary", () => {
    const q = computePacketQuality(
      ALL_FEEDS.map((f) => (f === "market_snapshot" ? missing(f) : fresh(f))),
    );
    // market_snapshot weight is 0.5, so its absence alone caps the score at 0.5.
    expect(q.score).toBe(0.5);
    expect(q.label).toBe("adequate");
    expect(q.degraded_feeds).toEqual(["market_snapshot"]);
  });

  test("stale feed earns half credit and is flagged degraded", () => {
    const q = computePacketQuality(ALL_FEEDS.map((f) => (f === "on_chain" ? stale(f) : fresh(f))));
    // 0.9 fresh + 0.05 (half of on_chain's 0.1) = 0.95
    expect(q.score).toBe(0.95);
    expect(q.label).toBe("strong");
    expect(q.degraded_feeds).toEqual(["on_chain"]);
    expect(q.notes).toContain("on_chain");
  });

  test("weak when the market snapshot is stale and everything else is missing", () => {
    const q = computePacketQuality(
      ALL_FEEDS.map((f) => (f === "market_snapshot" ? stale(f) : missing(f))),
    );
    // market_snapshot at half credit (0.5 * 0.5 = 0.25), nothing else.
    expect(q.score).toBe(0.25);
    expect(q.label).toBe("weak");
    expect(q.degraded_feeds.length).toBe(6);
  });

  test("assembled packet carries a quality score derived from its freshness", () => {
    const packet = assembleContextPacket(trigger, {
      dataSource: ds,
      now: () => new Date("2026-06-07T12:01:00.000Z"),
    });
    // degraded_feeds must exactly match the stale entries in source_freshness.
    const staleFeeds = packet.source_freshness.filter((f) => f.stale).map((f) => f.feed);
    expect(packet.quality.degraded_feeds).toEqual(staleFeeds);
    expect(packet.quality.score).toBeGreaterThanOrEqual(0);
    expect(packet.quality.score).toBeLessThanOrEqual(1);
    expect(["strong", "adequate", "weak"]).toContain(packet.quality.label);
  });
});
