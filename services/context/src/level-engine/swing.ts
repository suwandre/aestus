/**
 * Swing structure detection (P12-T003).
 *
 * Finds recent swing highs/lows (pivots) over a configurable window and turns
 * them into structural support/resistance {@link LevelCandidate}s. A swing high
 * at index i is a candle whose high strictly exceeds the highs of `strength`
 * candles on each side; a swing low is the mirror on lows. Deterministic over a
 * given candle series; no LLM input (hard rule #2).
 */
import type { LevelCandidate, LevelDerivation } from "@aestus/contracts";
import type { Candle, LevelEngineConfig } from "./types";

/** A detected pivot. `index` is into the candle array; `kind` is high or low. */
export interface Swing {
  index: number;
  price: number;
  kind: "high" | "low";
}

/**
 * Detect swing highs/lows in the most recent `lookback` candles. A pivot needs
 * `strength` candles on each side, so the scannable range is
 * `[max(strength, n−lookback), n−1−strength]`. Strict comparisons mean flat
 * plateaus produce no pivot (neither side strictly dominates).
 */
export function detectSwings(candles: Candle[], strength: number, lookback: number): Swing[] {
  const n = candles.length;
  const swings: Swing[] = [];
  const start = Math.max(strength, n - lookback);
  for (let i = start; i <= n - 1 - strength; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (candles[j]!.high >= c.high) isHigh = false;
      if (candles[j]!.low <= c.low) isLow = false;
    }
    if (isHigh) swings.push({ index: i, price: c.high, kind: "high" });
    if (isLow) swings.push({ index: i, price: c.low, kind: "low" });
  }
  return swings;
}

/** Recency-weighted confidence for a pivot: newer pivots score higher. */
function swingConfidence(index: number, n: number): number {
  const recency = n > 1 ? index / (n - 1) : 1;
  return Math.round((0.5 + 0.4 * recency) * 100) / 100;
}

/** Result of the swing step: structural candidates plus an audit derivation. */
export interface SwingResult {
  candidates: LevelCandidate[];
  derivation: LevelDerivation;
}

/**
 * Build structural support/resistance candidates from detected swings. A swing
 * priced above the reference is resistance, at/below it is support; the source
 * records which pivot it came from, and confidence is recency-weighted.
 */
export function computeSwingStructure(
  candles: Candle[],
  referencePrice: number,
  config: LevelEngineConfig,
): SwingResult {
  const swings = detectSwings(candles, config.swingStrength, config.swingLookback);
  const candidates: LevelCandidate[] = swings.map((s) => ({
    price: s.price,
    source: s.kind === "high" ? "swing_high" : "swing_low",
    role: s.price > referencePrice ? "resistance" : "support",
    confidence: swingConfidence(s.index, candles.length),
    note: `${config.swingStrength}-bar swing ${s.kind}`,
  }));
  return {
    candidates,
    derivation: {
      component: "swing_structure",
      method: `${config.swingStrength}-bar pivots over last ${config.swingLookback} candles`,
      inputs: {
        strength: config.swingStrength,
        lookback: config.swingLookback,
        count: swings.length,
      },
      outputs: candidates.map((c) => c.price),
    },
  };
}
