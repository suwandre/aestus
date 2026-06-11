/**
 * P11-T013 — full-packet integration test for a BTC funding-spike anomaly.
 *
 * Loads the `anom-001` funding-spike trigger from the anomalies fixture and
 * assembles a packet through the FixtureDataSource with the same options the
 * service uses, then asserts the packet validates against the contract and that
 * every retrieval section (market / correlated / venue / news / macro /
 * on-chain / analogues / freshness / quality) contains exactly what the fixtures
 * imply. This locks the end-to-end retrieval logic, not just per-section units.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type AnomalyEvent,
  AnomalyEvent as AnomalyEventSchema,
  ContextPacket as ContextPacketSchema,
} from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { assembleContextPacket } from "../src/builder";

const config = loadConfig();
const ds = new FixtureDataSource(config);

/** The BTC funding-spike trigger fixture (anom-001). */
function loadFundingSpikeTrigger(): AnomalyEvent {
  const path = fileURLToPath(new URL("../../../fixtures/anomalies/events.json", import.meta.url));
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown[];
  const found = raw.map((a) => AnomalyEventSchema.parse(a)).find((a) => a.id === "anom-001");
  if (!found) throw new Error("fixture anom-001 (BTC funding_spike) missing");
  return found;
}

/** Assemble exactly as the service does (same config-driven options). */
function assemble(trigger: AnomalyEvent) {
  return assembleContextPacket(trigger, {
    dataSource: ds,
    now: () => new Date("2026-06-07T12:00:05Z"),
    correlatedAssets: config.correlatedAssets,
    venueThresholds: {
      fundingDispersion: config.venueFundingDispersion,
      basisDispersionBps: config.venueBasisDispersionBps,
    },
    newsWindowMinutes: config.newsWindowMinutes,
    newsMinRelevance: config.newsMinRelevance,
    macroWindowHours: config.macroWindowHours,
    macroMinImportance: config.macroMinImportance,
    onChainWindowHours: config.onChainWindowHours,
    analogueLimit: config.analogueLimit,
    freshnessStaleSeconds: config.freshnessStaleSeconds,
  });
}

describe("P11-T013 BTC funding-spike context packet", () => {
  const trigger = loadFundingSpikeTrigger();

  test("trigger fixture is a BTC funding spike", () => {
    expect(trigger.type).toBe("funding_spike");
    expect(trigger.assets).toEqual(["crypto:btc-usdt"]);
  });

  test("assembled packet validates against the contract", () => {
    const packet = assemble(trigger);
    expect(() => ContextPacketSchema.parse(packet)).not.toThrow();
    expect(packet.primary_asset).toBe("crypto:btc-usdt");
    expect(packet.trigger.id).toBe("anom-001");
  });

  test("market snapshot is the real BTC state, not a placeholder", () => {
    const { market_snapshot } = assemble(trigger);
    expect(market_snapshot.canonical_asset_id).toBe("crypto:btc-usdt");
    expect(market_snapshot.funding_z).toBe(2.6);
    expect(market_snapshot.regime.trend).toBe("trending_up");
  });

  test("correlated assets include configured proxies that have snapshots", () => {
    const { correlated_assets } = assemble(trigger);
    const ids = correlated_assets.map((s) => s.canonical_asset_id);
    expect(ids).toContain("macro:spx");
    expect(ids).not.toContain("crypto:btc-usdt"); // primary excluded
  });

  test("venue comparison spans BTC's three venues", () => {
    const { venue_comparison } = assemble(trigger);
    expect(venue_comparison).toBeDefined();
    expect(venue_comparison!.asset).toBe("crypto:btc-usdt");
    const venues = venue_comparison!.quotes.map((q) => q.venue).sort();
    expect(venues).toEqual(["binance", "bybit", "okx"]);
  });

  test("news is BTC-relevant only, ordered by relevance", () => {
    const { news } = assemble(trigger);
    expect(news.map((n) => n.id)).toEqual(["news-2026-06-07-003", "news-2026-06-07-001"]);
    expect(news.every((n) => n.entities.includes("crypto:btc-usdt"))).toBe(true);
  });

  test("macro captures the recent NFP within the default window (CPI just outside)", () => {
    const { macro } = assemble(trigger);
    const ids = macro.map((m) => m.event_id);
    expect(ids).toContain("us-nfp-2026-06");
    expect(ids).not.toContain("us-cpi-2026-06"); // 06-10 12:30 is >72h out
  });

  test("on-chain has asset flows/whale moves plus market-wide stablecoin", () => {
    const { on_chain } = assemble(trigger);
    const types = on_chain.map((e) => e.event_type);
    expect(types).toContain("exchange_flow");
    expect(types).toContain("whale_transfer");
    expect(types).toContain("stablecoin_mint_burn");
  });

  test("historical analogues are same-type, regime-ranked", () => {
    const { historical_analogues } = assemble(trigger);
    expect(historical_analogues.length).toBeGreaterThan(0);
    expect(historical_analogues[0]!.similarity).toBe(0.86); // all-regime-match first
  });

  test("freshness covers all feeds and quality is derived from it", () => {
    const packet = assemble(trigger);
    expect(packet.source_freshness.map((f) => f.feed).sort()).toEqual([
      "correlated_assets",
      "macro",
      "market_snapshot",
      "news",
      "on_chain",
      "venue_quotes",
    ]);
    const staleFeeds = packet.source_freshness.filter((f) => f.stale).map((f) => f.feed);
    expect(packet.quality.degraded_feeds).toEqual(staleFeeds);
    expect(["strong", "adequate", "weak"]).toContain(packet.quality.label);
  });
});
