import { describe, expect, test } from "bun:test";
import type { AnomalyEvent } from "@aestus/contracts";
import { ContextPacket } from "@aestus/contracts";
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

describe("P12-T011 level audit trail in the context packet", () => {
  test("packet carries engine-computed levels from candle/liquidation fixtures (not placeholder)", () => {
    const ds = new FixtureDataSource(loadConfig());
    const packet = assembleContextPacket(trigger, { dataSource: ds });
    const levels = packet.deterministic_levels;
    // Real reference price from the candle fixture (last close 68250), not the
    // placeholder marker (reference 0 / placeholder note).
    expect(levels.reference_price).toBe(68250);
    expect(levels.method_notes ?? "").not.toContain("placeholder");
    expect(ContextPacket.parse(packet)).toBeTruthy();
  });

  test("a user can inspect why each numeric level exists (formulas + inputs + outputs)", () => {
    const ds = new FixtureDataSource(loadConfig());
    const packet = assembleContextPacket(trigger, { dataSource: ds });
    const { derivations } = packet.deterministic_levels;
    // The audit trail covers the core derivations.
    const components = new Set(derivations.map((d) => d.component));
    for (const c of [
      "reference_price",
      "atr_bands",
      "swing_structure",
      "entry_zone",
      "invalidation",
      "targets",
      "no_trade",
    ]) {
      expect(components.has(c)).toBe(true);
    }
    // Each derivation records a human-readable method and its numeric inputs.
    for (const d of derivations) {
      expect(d.method.length).toBeGreaterThan(0);
      expect(typeof d.inputs).toBe("object");
    }
    // The ATR derivation exposes the formula inputs behind the band.
    const atr = derivations.find((d) => d.component === "atr_bands")!;
    expect(atr.inputs.atr).toBeGreaterThan(0);
  });

  test("candle/liquidation retrieval is wired through the data source", () => {
    const ds = new FixtureDataSource(loadConfig());
    expect(ds.candles("crypto:btc-usdt").length).toBeGreaterThan(0);
    // Liquidation clusters come from the features fixture's liq_clusters extra.
    expect(ds.liquidationClusters("crypto:btc-usdt").length).toBeGreaterThan(0);
    // Unknown asset → no candles → builder falls back to placeholder levels.
    expect(ds.candles("crypto:doge-usdt")).toEqual([]);
    const packet = assembleContextPacket(
      { ...trigger, assets: ["crypto:doge-usdt"] },
      { dataSource: ds },
    );
    expect(packet.deterministic_levels.method_notes ?? "").toContain("placeholder");
  });
});
