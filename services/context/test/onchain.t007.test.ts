import { describe, expect, test } from "bun:test";
import type { AnomalyEvent } from "@aestus/contracts";
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

describe("P11-T007 on-chain retrieval", () => {
  test("includes asset flows/whale events plus market-wide stablecoin context", () => {
    const packet = assembleContextPacket(trigger, { dataSource: ds, onChainWindowHours: 48 });
    const types = packet.on_chain.map((e) => e.event_type);
    expect(types).toContain("exchange_flow"); // BTC net outflow
    expect(types).toContain("whale_transfer"); // BTC whale move
    expect(types).toContain("stablecoin_mint_burn"); // market-wide (USDT)
    // Sorted most-recent first.
    const ts = packet.on_chain.map((e) => Date.parse(e.timestamp));
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
  });

  test("excludes events outside the look-back window", () => {
    // 3h window: only the 09:30 whale move qualifies (09:00 cutoff drops 00:00/08:15).
    const packet = assembleContextPacket(trigger, { dataSource: ds, onChainWindowHours: 3 });
    expect(packet.on_chain.length).toBe(1);
    expect(packet.on_chain[0]!.event_type).toBe("whale_transfer");
  });
});
