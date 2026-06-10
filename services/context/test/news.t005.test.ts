import { describe, expect, test } from "bun:test";
import type { AnomalyEvent } from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { assembleContextPacket } from "../src/builder";

const config = loadConfig();

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

describe("P11-T005 news retrieval", () => {
  test("includes only relevant, recent, asset-matched news with source metadata", () => {
    const ds = new FixtureDataSource(config);
    const packet = assembleContextPacket(trigger, {
      dataSource: ds,
      newsWindowMinutes: config.newsWindowMinutes,
      newsMinRelevance: config.newsMinRelevance,
    });

    const ids = packet.news.map((n) => n.id);
    // Both BTC ETF items match; the ETH whale item does not.
    expect(ids).toContain("news-2026-06-07-001");
    expect(ids).toContain("news-2026-06-07-003");
    expect(ids).not.toContain("news-2026-06-07-002");
    // Sorted by relevance descending.
    expect(packet.news[0]!.relevance_score).toBeGreaterThanOrEqual(packet.news[1]!.relevance_score);
    // Source metadata present.
    expect(packet.news[0]!.source).toBeTruthy();
    expect(packet.news[0]!.source_type).toBeTruthy();
  });

  test("drops below-threshold and out-of-window news", () => {
    const ds = new FixtureDataSource(config);
    // ETH anomaly: only the ETH whale item (relevance 0.61) is asset-matched.
    const ethTrigger = { ...trigger, assets: ["crypto:eth-usdt"] };
    const high = assembleContextPacket(ethTrigger, {
      dataSource: ds,
      newsWindowMinutes: 240,
      newsMinRelevance: 0.7,
    });
    expect(high.news.length).toBe(0); // 0.61 < 0.7 floor

    const narrow = assembleContextPacket(ethTrigger, {
      dataSource: ds,
      newsWindowMinutes: 30, // item published 10:20, anomaly 12:00 → outside 30m
      newsMinRelevance: 0.5,
    });
    expect(narrow.news.length).toBe(0);
  });
});
