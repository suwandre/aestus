import { describe, expect, test } from "bun:test";
import { computeLevels, DEFAULT_LEVEL_CONFIG, evaluateNoTrade } from "../src/level-engine";
import type { Candle } from "../src/level-engine";

const cfg = DEFAULT_LEVEL_CONFIG; // minCandles 20, noiseAtrPctThreshold 0.08
const entry = { low: 99, high: 101 };

/** N calm candles around `base` with a small constant range. */
function calm(n: number, base: number, range = 2): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(Date.parse("2026-06-07T00:00:00.000Z") + i * 3_600_000).toISOString(),
    open: base,
    high: base + range,
    low: base - range,
    close: base,
    volume: 100,
  }));
}

describe("P12-T010 no-trade condition output", () => {
  test("insufficient history fires a no-trade with a re-check", () => {
    const nt = evaluateNoTrade("long", 100, 5, 1, entry, 95, cfg);
    expect(nt.is_no_trade).toBe(true);
    expect(nt.reasons.some((r) => r.includes("insufficient"))).toBe(true);
    expect(nt.recheck.length).toBeGreaterThan(0);
  });

  test("excessive volatility fires a no-trade", () => {
    const nt = evaluateNoTrade("long", 100, 30, 20, entry, 80, cfg); // ATR 20% of price
    expect(nt.is_no_trade).toBe(true);
    expect(nt.reasons.some((r) => r.includes("volatility too high"))).toBe(true);
  });

  test("no directional bias fires a no-trade", () => {
    const nt = evaluateNoTrade("none", 100, 30, 1, entry, 100, cfg);
    expect(nt.is_no_trade).toBe(true);
    expect(nt.reasons.some((r) => r.includes("no directional bias"))).toBe(true);
  });

  test("a clean directional setup is NOT a no-trade", () => {
    const nt = evaluateNoTrade("long", 100, 30, 1, entry, 95, cfg);
    expect(nt.is_no_trade).toBe(false);
    expect(nt.reasons).toEqual([]);
  });

  test("computeLevels: too-noisy directional input → no-trade, size withheld", () => {
    // ATR ≈ 20 on price 100 → 20% > 8% threshold.
    const candles = calm(25, 100, 10); // range 20 → constant TR 20
    const levels = computeLevels({ asset: "crypto:btc-usdt", candles, direction: "long" });
    expect(levels.no_trade).toBeDefined();
    expect(levels.no_trade!.is_no_trade).toBe(true);
    expect(levels.no_trade!.reasons.length).toBeGreaterThan(0);
    expect(levels.no_trade!.recheck.length).toBeGreaterThan(0);
    // Size is withheld for a no-trade.
    expect(levels.size_suggestion).toBeNull();
    expect(levels.derivations.some((d) => d.component === "no_trade")).toBe(true);
  });

  test("computeLevels: clean directional input → tradeable (is_no_trade false)", () => {
    const candles = calm(25, 68000, 80); // ATR 160 on 68000 ≈ 0.24% « 8%
    const levels = computeLevels({ asset: "crypto:btc-usdt", candles, direction: "long" });
    expect(levels.no_trade!.is_no_trade).toBe(false);
    expect(levels.size_suggestion).not.toBeNull();
  });

  test("insufficient-data no-trade still produces a valid, non-throwing result", () => {
    const levels = computeLevels({ asset: "x", candles: calm(3, 100, 2), direction: "long" });
    expect(levels.no_trade!.is_no_trade).toBe(true);
    expect(levels.size_suggestion).toBeNull();
  });
});
