/**
 * No-trade condition output (P12-T010).
 *
 * When the data or structure is too thin/noisy to support a directional
 * proposal, the engine emits an explicit no-trade with the reasons and the
 * conditions that would make it re-evaluate — so a no-trade briefing can show
 * *why* and *what would change the assessment* (hard rule #3: no-trade is a
 * first-class outcome). Deterministic; no LLM input (hard rule #2).
 */
import type {
  EntryZone,
  LevelDerivation,
  LevelDirection,
  NoTradeCondition,
} from "@aestus/contracts";
import type { LevelEngineConfig } from "./types";

/**
 * Evaluate the no-trade conditions. `is_no_trade` is true when any check fires;
 * each firing check contributes a reason and a matching re-check condition.
 */
export function evaluateNoTrade(
  direction: LevelDirection,
  referencePrice: number,
  candleCount: number,
  atr: number | undefined,
  entryZone: EntryZone,
  invalidation: number,
  config: LevelEngineConfig,
): NoTradeCondition {
  const reasons: string[] = [];
  const recheck: string[] = [];

  if (referencePrice <= 0) {
    reasons.push("no reference price (missing market data)");
    recheck.push("re-evaluate once a live price is available");
  }
  if (candleCount < config.minCandles) {
    reasons.push(`insufficient price history (${candleCount} < ${config.minCandles} candles)`);
    recheck.push(`re-evaluate once at least ${config.minCandles} candles are available`);
  }
  const atrPct = referencePrice > 0 ? (atr ?? 0) / referencePrice : 0;
  if (atrPct > config.noiseAtrPctThreshold) {
    const pct = (atrPct * 100).toFixed(1);
    const thr = (config.noiseAtrPctThreshold * 100).toFixed(0);
    reasons.push(`volatility too high (ATR ${pct}% of price > ${thr}% threshold)`);
    recheck.push(`re-evaluate when ATR falls back below ${thr}% of price`);
  }
  if (direction === "none") {
    reasons.push("no directional bias (regime is not trending)");
    recheck.push("re-evaluate when the regime resolves to trending up or down");
  }
  const stop = Math.abs((entryZone.low + entryZone.high) / 2 - invalidation);
  if (direction !== "none" && referencePrice > 0 && stop / referencePrice < 1e-6) {
    reasons.push("entry and invalidation collapse (no measurable stop distance)");
    recheck.push("re-evaluate when structure/volatility define a non-zero stop");
  }

  return { is_no_trade: reasons.length > 0, reasons, recheck };
}

/** Audit derivation for the no-trade evaluation. */
export function noTradeDerivation(
  noTrade: NoTradeCondition,
  candleCount: number,
  atrPct: number,
  config: LevelEngineConfig,
): LevelDerivation {
  return {
    component: "no_trade",
    method:
      "checks: reference price, candle count, ATR/price noise, directional bias, stop distance",
    inputs: {
      candle_count: candleCount,
      atr_pct: Math.round(atrPct * 10000) / 10000,
      min_candles: config.minCandles,
      noise_threshold: config.noiseAtrPctThreshold,
      is_no_trade: noTrade.is_no_trade ? 1 : 0,
    },
    outputs: [],
    note: noTrade.reasons.length > 0 ? noTrade.reasons.join("; ") : "tradeable setup",
  };
}
