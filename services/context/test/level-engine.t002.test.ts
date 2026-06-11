import { describe, expect, test } from "bun:test";
import { averageTrueRange, computeLevels, computeVolatilityBands } from "../src/level-engine";
import { DEFAULT_LEVEL_CONFIG } from "../src/level-engine";
import type { Candle } from "../src/level-engine";

/**
 * A series whose true range is a constant 200 every candle: each bar spans
 * exactly 200 (high−low) and never gaps beyond the prior close, so ATR = 200
 * under both the simple-mean and Wilder-smoothing branches — exactly verifiable.
 */
const constantTrCandles: Candle[] = Array.from({ length: 20 }, (_, i) => {
  const base = 68000 + i * 50;
  return {
    time: new Date(Date.parse("2026-06-07T00:00:00.000Z") + i * 3_600_000).toISOString(),
    open: base,
    high: base + 100,
    low: base - 100,
    close: base,
    volume: 100,
  };
});

describe("P12-T002 ATR / volatility bands", () => {
  test("ATR equals the constant true range of the series", () => {
    expect(averageTrueRange(constantTrCandles, 14)).toBeCloseTo(200, 6);
  });

  test("band is reference ± multiplier·ATR with formula metadata", () => {
    const ref = 69000;
    const result = computeVolatilityBands(constantTrCandles, ref, DEFAULT_LEVEL_CONFIG);
    expect(result).not.toBeNull();
    const { atr, bands } = result!;
    expect(atr).toBeCloseTo(200, 6);
    expect(bands.upper).toBeCloseTo(ref + DEFAULT_LEVEL_CONFIG.atrMultiplier * 200, 6);
    expect(bands.lower).toBeCloseTo(ref - DEFAULT_LEVEL_CONFIG.atrMultiplier * 200, 6);
    expect(bands.period).toBe(14);
    expect(bands.multiplier).toBe(DEFAULT_LEVEL_CONFIG.atrMultiplier);
    // Formula metadata is present and human-readable (audit trail, T011).
    expect(bands.formula).toContain("ATR");
  });

  test("computeLevels surfaces atr + volatility_bands and an audit derivation", () => {
    const levels = computeLevels({ asset: "crypto:btc-usdt", candles: constantTrCandles });
    expect(levels.atr).toBeCloseTo(200, 6);
    expect(levels.volatility_bands).toBeDefined();
    expect(levels.volatility_bands!.formula).toContain("ATR");
    const deriv = levels.derivations.find((d) => d.component === "atr_bands");
    expect(deriv).toBeDefined();
    expect(deriv!.inputs.atr).toBeCloseTo(200, 6);
  });

  test("returns null / no bands when there are too few candles", () => {
    expect(computeVolatilityBands([], 100, DEFAULT_LEVEL_CONFIG)).toBeNull();
    const levels = computeLevels({ asset: "x", candles: [], referencePrice: 100 });
    expect(levels.volatility_bands).toBeUndefined();
    expect(levels.atr).toBeUndefined();
  });
});
