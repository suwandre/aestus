import { describe, expect, test } from "bun:test";
import { computeLevels, computeLiquidationLevels } from "../src/level-engine";
import type { Candle, LiquidationCluster } from "../src/level-engine";

// Mirrors the shape carried on the features fixture (`liq_clusters`).
const clusters: LiquidationCluster[] = [
  { price_low: 69200, price_high: 69400, total_size: 820.5, side: "buy" },
  { price_low: 66700, price_high: 66900, total_size: 12.0, side: "sell" },
];

const flatCandles: Candle[] = Array.from({ length: 5 }, (_, i) => ({
  time: new Date(Date.parse("2026-06-07T00:00:00.000Z") + i * 3_600_000).toISOString(),
  open: 68250,
  high: 68300,
  low: 68200,
  close: 68250,
  volume: 100,
}));

describe("P12-T004 liquidation cluster levels", () => {
  test("clusters become target/context candidates with size-weighted confidence", () => {
    const result = computeLiquidationLevels(clusters, 68250, "none");
    const upper = result.candidates.find((c) => c.price === 69300);
    const lower = result.candidates.find((c) => c.price === 66800);
    // Above reference → target; below reference → context.
    expect(upper).toMatchObject({ source: "liquidation_cluster", role: "target" });
    expect(lower).toMatchObject({ source: "liquidation_cluster", role: "context" });
    // Deepest pool (820.5) has the highest confidence.
    expect(upper!.confidence).toBeGreaterThan(lower!.confidence);
    expect(upper!.confidence).toBeCloseTo(0.9, 6);
  });

  test("short direction flips target/context sides", () => {
    const result = computeLiquidationLevels(clusters, 68250, "short");
    expect(result.candidates.find((c) => c.price === 69300)!.role).toBe("context");
    expect(result.candidates.find((c) => c.price === 66800)!.role).toBe("target");
  });

  test("computeLevels surfaces cluster levels (chart/briefing can show them)", () => {
    const levels = computeLevels({
      asset: "crypto:btc-usdt",
      candles: flatCandles,
      liquidationClusters: clusters,
    });
    // Flat list present, sorted nearest-to-reference first (69300 is 1050
    // away, 66800 is 1450 away from the 68250 reference).
    expect(levels.liquidation_clusters).toEqual([69300, 66800]);
    expect(levels.candidates.some((c) => c.source === "liquidation_cluster")).toBe(true);
    expect(levels.derivations.some((d) => d.component === "liquidation_clusters")).toBe(true);
  });

  test("no clusters → empty list, no crash", () => {
    const levels = computeLevels({ asset: "x", candles: flatCandles });
    expect(levels.liquidation_clusters).toEqual([]);
  });
});
