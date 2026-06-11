import { describe, expect, test } from "bun:test";
import {
  computeLevels,
  computeVolumeNodes,
  DEFAULT_LEVEL_CONFIG,
  projectStructure,
} from "../src/level-engine";
import type { LevelCandidate } from "@aestus/contracts";
import type { Candle } from "../src/level-engine";

// Gentle series with one 10× volume spike at close 67000 (index 5).
const closes = [67800, 67850, 67900, 67950, 67980, 67000, 68000, 68020, 68010, 68000];
const volumes = [100, 100, 100, 100, 100, 1000, 100, 100, 100, 100];
const volCandles: Candle[] = closes.map((close, i) => ({
  time: new Date(Date.parse("2026-06-07T00:00:00.000Z") + i * 3_600_000).toISOString(),
  open: close,
  high: close + 50,
  low: close - 50,
  close,
  volume: volumes[i]!,
}));

describe("P12-T005 support/resistance from pivots + volume nodes", () => {
  test("high-volume candle becomes a volume_node S/R with confidence + source", () => {
    const { candidates } = computeVolumeNodes(volCandles, 68000, DEFAULT_LEVEL_CONFIG);
    expect(candidates.length).toBe(1);
    expect(candidates[0]).toMatchObject({
      price: 67000,
      source: "volume_node",
      role: "support",
    });
    expect(candidates[0]!.confidence).toBeCloseTo(0.9, 6);
  });

  test("level output S/R candidates all carry confidence + source", () => {
    const levels = computeLevels({ asset: "crypto:btc-usdt", candles: volCandles });
    const sr = levels.candidates.filter((c) => c.role === "support" || c.role === "resistance");
    expect(sr.length).toBeGreaterThan(0);
    for (const c of sr) {
      expect(c.source).toBeDefined();
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
    expect(levels.candidates.some((c) => c.source === "volume_node")).toBe(true);
    expect(levels.derivations.some((d) => d.component === "support_resistance")).toBe(true);
  });

  test("near-equal pivot and volume node merge into one S/R (highest confidence wins)", () => {
    const cands: LevelCandidate[] = [
      { price: 68000, source: "swing_low", role: "support", confidence: 0.6 },
      { price: 68010, source: "volume_node", role: "support", confidence: 0.9 },
    ];
    const { supports } = projectStructure(cands, 68000, DEFAULT_LEVEL_CONFIG.srTolerancePct);
    // Within tolerance (272) → one level, represented by the 0.9-confidence node.
    expect(supports).toEqual([68010]);
  });

  test("levels beyond tolerance stay distinct", () => {
    const cands: LevelCandidate[] = [
      { price: 68000, source: "swing_low", role: "support", confidence: 0.6 },
      { price: 67000, source: "volume_node", role: "support", confidence: 0.9 },
    ];
    const { supports } = projectStructure(cands, 68000, DEFAULT_LEVEL_CONFIG.srTolerancePct);
    expect(supports).toEqual([68000, 67000]); // nearest-below first
  });
});
