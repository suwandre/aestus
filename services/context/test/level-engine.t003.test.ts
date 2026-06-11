import { describe, expect, test } from "bun:test";
import { computeLevels, detectSwings } from "../src/level-engine";
import type { Candle } from "../src/level-engine";

/**
 * Mountain-then-valley series with exactly one clean swing high (high 115 at
 * index 4) and one clean swing low (low 88 at index 8), each dominating two
 * neighbours per side. Last close 104 → 115 is resistance, 88 is support.
 */
const highs = [100, 102, 105, 108, 115, 110, 107, 104, 100, 103, 106, 109];
const lows = [95, 97, 100, 103, 108, 104, 100, 96, 88, 92, 96, 99];
const candles: Candle[] = highs.map((high, i) => ({
  time: new Date(Date.parse("2026-06-07T00:00:00.000Z") + i * 3_600_000).toISOString(),
  open: lows[i]! + 1,
  high,
  low: lows[i]!,
  close: i === highs.length - 1 ? 104 : lows[i]! + 2,
  volume: 100,
}));

describe("P12-T003 swing structure detection", () => {
  test("detects the single swing high and swing low over the window", () => {
    const swings = detectSwings(candles, 2, 60);
    const highSwing = swings.find((s) => s.kind === "high");
    const lowSwing = swings.find((s) => s.kind === "low");
    expect(highSwing?.price).toBe(115);
    expect(lowSwing?.price).toBe(88);
    // No spurious extra pivots in this construction.
    expect(swings.length).toBe(2);
  });

  test("level output includes structural support/resistance candidates", () => {
    const levels = computeLevels({ asset: "crypto:btc-usdt", candles });
    expect(levels.reference_price).toBe(104);
    // Flat arrays projected from candidates.
    expect(levels.supports).toContain(88);
    expect(levels.resistances).toContain(115);
    // Candidates carry source + role + confidence.
    const res = levels.candidates.find((c) => c.price === 115);
    const sup = levels.candidates.find((c) => c.price === 88);
    expect(res).toMatchObject({ source: "swing_high", role: "resistance" });
    expect(sup).toMatchObject({ source: "swing_low", role: "support" });
    expect(res!.confidence).toBeGreaterThan(0);
    expect(res!.confidence).toBeLessThanOrEqual(1);
    // Audit derivation present.
    expect(levels.derivations.some((d) => d.component === "swing_structure")).toBe(true);
  });

  test("strength filters out minor wiggles (higher strength → fewer pivots)", () => {
    const strict = detectSwings(candles, 4, 60);
    // With strength 4 the swing low at index 8 lacks 4 valid neighbours each
    // side within range, so the strict pass finds at most the dominant high.
    expect(strict.length).toBeLessThanOrEqual(detectSwings(candles, 2, 60).length);
  });
});
