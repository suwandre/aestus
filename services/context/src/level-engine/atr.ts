/**
 * ATR / volatility-band calculation (P12-T002).
 *
 * Computes the Average True Range over recent OHLCV candles and derives a
 * volatility band (reference ± multiplier·ATR) with formula metadata for the
 * audit trail (T011). Deterministic: the same candles + config always yield the
 * same ATR. No LLM input (hard rule #2).
 */
import type { LevelDerivation, VolatilityBands } from "@aestus/contracts";
import type { Candle, LevelEngineConfig } from "./types";

/**
 * True ranges for a candle series, one per candle from index 1 onward (each
 * needs the previous close). `TR = max(high−low, |high−prevClose|,
 * |low−prevClose|)`. Returns an empty array for fewer than two candles.
 */
export function trueRanges(candles: Candle[]): number[] {
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prevClose = candles[i - 1]!.close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  return trs;
}

/**
 * Wilder's ATR over `period` candles. With at most `period` true ranges it is
 * the simple mean of those available; beyond that it applies Wilder's smoothing
 * `ATR_k = (ATR_{k-1}·(period−1) + TR_k) / period`. A constant true range
 * yields exactly that value under either branch (used by the T002 test).
 */
export function averageTrueRange(candles: Candle[], period: number): number {
  const trs = trueRanges(candles);
  if (trs.length === 0) return 0;
  if (trs.length <= period) {
    return trs.reduce((sum, tr) => sum + tr, 0) / trs.length;
  }
  let atr = trs.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  for (let k = period; k < trs.length; k++) {
    atr = (atr * (period - 1) + trs[k]!) / period;
  }
  return atr;
}

/** ATR + volatility band around the reference price, with formula metadata. */
export interface VolatilityBandResult {
  atr: number;
  bands: VolatilityBands;
  derivation: LevelDerivation;
}

/**
 * Compute the ATR and a `reference ± multiplier·ATR` band. Returns null when
 * there are too few candles to form a true range (the no-trade policy, T010,
 * turns that into an explicit no-trade rather than a fake band).
 */
export function computeVolatilityBands(
  candles: Candle[],
  referencePrice: number,
  config: LevelEngineConfig,
): VolatilityBandResult | null {
  if (candles.length < 2) return null;
  const atr = averageTrueRange(candles, config.atrPeriod);
  const period = Math.min(config.atrPeriod, candles.length - 1);
  const multiplier = config.atrMultiplier;
  const upper = referencePrice + multiplier * atr;
  const lower = referencePrice - multiplier * atr;
  const formula = `ref ± ${multiplier}·ATR(${period})`;
  return {
    atr,
    bands: { atr, period, multiplier, upper, lower, formula },
    derivation: {
      component: "atr_bands",
      method: `Wilder ATR over ${period} candles; band = ${formula}`,
      inputs: { atr, period, multiplier, reference_price: referencePrice },
      outputs: [lower, upper],
    },
  };
}
