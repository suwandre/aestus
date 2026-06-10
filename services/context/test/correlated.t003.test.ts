import { describe, expect, test } from "bun:test";
import type { AnomalyEvent } from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { assembleContextPacket } from "../src/builder";

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

describe("P11-T003 correlated assets", () => {
  test("includes cross-asset snapshots for the BTC anomaly", () => {
    const config = loadConfig();
    const ds = new FixtureDataSource(config);
    const packet = assembleContextPacket(trigger, {
      dataSource: ds,
      correlatedAssets: config.correlatedAssets,
    });

    const ids = packet.correlated_assets.map((s) => s.canonical_asset_id);
    expect(ids).toContain("macro:spx");
    expect(ids).not.toContain("crypto:btc-usdt"); // primary excluded
    // Only configured assets that have a snapshot are included.
    expect(packet.correlated_assets.length).toBeGreaterThan(0);
  });
});
