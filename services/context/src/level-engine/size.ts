/**
 * Size suggestion policy (P12-T009).
 *
 * Expresses position sizing as RISK-RELATIVE guidance — a fraction of account
 * to risk plus an optional notional — never an order quantity (hard rule #1: no
 * "buy N contracts"). Risk scales with the configured max risk, setup
 * confidence, and a volatility haircut; the notional (only when account equity
 * is known) follows from the entry→invalidation stop distance. Deterministic;
 * no LLM input (hard rule #2).
 */
import type { EntryZone, LevelDerivation, LevelDirection, SizeSuggestion } from "@aestus/contracts";
import type { LevelEngineConfig } from "./types";

/** Size suggestion plus an audit derivation. */
export interface SizeResult {
  size: SizeSuggestion;
  derivation: LevelDerivation;
}

const round = (x: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

/**
 * Compute a risk-relative size suggestion. `confidence` (0..1) scales risk
 * linearly; a volatility haircut shrinks risk when ATR/price exceeds the
 * baseline (floored so size never reaches zero). Returns null with no
 * direction (no-trade → no size).
 */
export function computeSizeSuggestion(
  direction: LevelDirection,
  entryZone: EntryZone,
  invalidation: number,
  atr: number | undefined,
  referencePrice: number,
  confidence: number,
  accountEquity: number | undefined,
  config: LevelEngineConfig,
): SizeResult | null {
  if (direction === "none") return null;

  const conf = Math.min(1, Math.max(0, confidence));
  const atrPct = referencePrice > 0 ? (atr ?? 0) / referencePrice : 0;
  const volFactor =
    atrPct > config.sizeBaselineVolPct
      ? Math.max(config.sizeMinVolFactor, config.sizeBaselineVolPct / atrPct)
      : 1;
  const riskPct = round(config.maxRiskPct * conf * volFactor, 4);

  const entryMid = (entryZone.low + entryZone.high) / 2;
  const stopDistance = Math.abs(entryMid - invalidation);

  const inputs: Record<string, number> = {
    max_risk_pct: config.maxRiskPct,
    confidence: conf,
    vol_factor: round(volFactor, 3),
    atr_pct: round(atrPct, 4),
    risk_pct: riskPct,
    stop_distance: round(stopDistance, 4),
  };

  let note = `risk ${(riskPct * 100).toFixed(2)}% of account at a ${round(stopDistance, 2)} stop — risk-relative guidance, not an order size`;
  let notional: number | undefined;
  if (accountEquity !== undefined && stopDistance > 0 && entryMid > 0) {
    notional = round((accountEquity * riskPct * entryMid) / stopDistance, 2);
    inputs.account_equity = accountEquity;
    note += `; ≈ ${notional} quote notional`;
  }

  const size: SizeSuggestion = {
    risk_pct: riskPct,
    ...(notional !== undefined ? { notional } : {}),
    note,
  };
  return {
    size,
    derivation: {
      component: "size",
      method:
        "risk_pct = maxRisk · confidence · volFactor; notional = equity·risk_pct·entry / stop distance",
      inputs,
      outputs: notional !== undefined ? [riskPct, notional] : [riskPct],
    },
  };
}
