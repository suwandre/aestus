import { describe, expect, test } from "bun:test";
import { computeLevels } from "../src/level-engine";
import type { Candle, LevelEngineInput, LiquidationCluster } from "../src/level-engine";

/**
 * Fully hand-computable fixed fixture. Each candle has high=close+20,
 * low=close-20 (range 40) and consecutive closes move ≤20, so the true range is
 * a constant 40 → ATR = 40 exactly. The close path puts a swing low at index 3
 * (low 980) and swing highs at indices 2 (1035) and 5 (1045) under 2-bar pivots.
 * Last close 1010 = reference; direction long.
 */
const closes = [1000, 1010, 1015, 1000, 1010, 1025, 1015, 1010];
const candles: Candle[] = closes.map((close, i) => ({
  time: new Date(Date.parse("2026-06-07T00:00:00.000Z") + i * 3_600_000).toISOString(),
  open: close,
  high: close + 20,
  low: close - 20,
  close,
  volume: 100,
}));

const liquidationClusters: LiquidationCluster[] = [
  { price_low: 1058, price_high: 1062, total_size: 100, side: "buy" }, // mid 1060 (above → target)
  { price_low: 948, price_high: 952, total_size: 50, side: "sell" }, // mid 950 (below → context)
];

// minCandles lowered so this compact, hand-verifiable series is tradeable;
// every other knob is the engine default.
const input: LevelEngineInput = {
  asset: "crypto:btc-usdt",
  candles,
  liquidationClusters,
  direction: "long",
  confidence: 1.0,
  config: { minCandles: 5 },
};

describe("P12-T012 deterministic level regression", () => {
  test("entry, invalidation, and targets are exact and stable", () => {
    const levels = computeLevels(input);

    // ATR = constant true range 40.
    expect(levels.atr).toBe(40);
    expect(levels.reference_price).toBe(1010);
    expect(levels.direction).toBe("long");

    // Entry: anchored on the swing-low support 980; high = min(ref, 980+halfWidth(20)).
    expect(levels.entry_zone).toEqual({ low: 980, high: 1000 });

    // Invalidation: no support strictly below the entry low → volatility stop
    // = entry low 980 − 1.0·ATR(40) = 940.
    expect(levels.invalidation).toBe(940);

    // Targets: structure (1035, 1045) + ATR multiples (1050, 1090, 1130) +
    // liquidity (1060), merged @ tol 4.04, capped at 5.
    expect(levels.targets).toEqual([1035, 1045, 1050, 1060, 1090]);

    // Liquidation clusters: midpoints, nearest-to-reference first.
    expect(levels.liquidation_clusters).toEqual([1060, 950]);

    // A clean, tradeable setup — not a no-trade.
    expect(levels.no_trade?.is_no_trade).toBe(false);
    expect(levels.size_suggestion).not.toBeNull();
  });

  test("the engine is pure & deterministic: identical input → byte-identical output", () => {
    // No LLM, no clock, no randomness — repeated runs cannot drift, so an LLM
    // change elsewhere can never alter these numeric levels (T012 done-when).
    const a = computeLevels(input);
    const b = computeLevels(input);
    expect(b).toEqual(a);
  });

  test("a short setup mirrors deterministically below the reference", () => {
    const levels = computeLevels({ ...input, direction: "short" });
    expect(levels.direction).toBe("short");
    // Short entry bounces toward resistance above the reference.
    expect(levels.entry_zone.high).toBeGreaterThanOrEqual(levels.reference_price);
    // All targets are below the reference, nearest-first (descending).
    for (const t of levels.targets) expect(t).toBeLessThan(levels.reference_price);
    expect(levels.targets).toEqual([...levels.targets].sort((x, y) => y - x));
    // Invalidation sits above the reference for a short.
    expect(levels.invalidation).toBeGreaterThan(levels.reference_price);
  });
});
