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

describe("P11-T002 market snapshot", () => {
  test("packet carries the trigger asset's current market state from fixtures", () => {
    const ds = new FixtureDataSource(loadConfig());
    const packet = assembleContextPacket(trigger, { dataSource: ds });
    const m = packet.market_snapshot;

    expect(m.canonical_asset_id).toBe("crypto:btc-usdt");
    // returns / volatility / funding / OI / volume / basis all populated.
    expect(m.funding_z).toBe(2.6);
    expect(m.oi_delta).toBe(0.085);
    expect(m.volume_z).toBe(1.9);
    expect(m.returns["24h"]).toBeCloseTo(0.021);
    expect(m.volatility["24h"]).toBeCloseTo(0.032);
    expect(m.basis.length).toBeGreaterThan(0);
    expect(m.regime.trend).toBe("trending_up");
  });

  test("falls back to a placeholder snapshot for an unknown asset", () => {
    const ds = new FixtureDataSource(loadConfig());
    const packet = assembleContextPacket(
      { ...trigger, assets: ["crypto:doge-usdt"] },
      { dataSource: ds },
    );
    expect(packet.market_snapshot.canonical_asset_id).toBe("crypto:doge-usdt");
    expect(packet.market_snapshot.funding_z).toBeNull();
  });
});
