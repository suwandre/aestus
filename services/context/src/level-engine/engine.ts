/**
 * Deterministic level/risk engine entry point (P12-T001).
 *
 * `computeLevels` turns a {@link LevelEngineInput} (OHLCV candles, liquidation
 * clusters, reference price) into a {@link DeterministicLevels} output. Hard
 * rule #2: every number is produced here by code, never by an LLM — this module
 * imports no model, prompt, or briefing code. At T001 the engine resolves the
 * reference price and direction and returns a valid minimal result; later P12
 * tasks (T002–T010) fill in ATR bands, swing structure, liquidation/S-R levels,
 * and the entry/invalidation/target/size/no-trade policies, each recording its
 * formula in `derivations` (T011).
 */
import type { DeterministicLevels, LevelDerivation, LevelDirection } from "@aestus/contracts";
import type { LevelEngineConfig, LevelEngineInput, TradeDirection } from "./types";
import { computeVolatilityBands } from "./atr";

/** Default engine tuning. Changing a value changes a formula, not the data. */
export const DEFAULT_LEVEL_CONFIG: LevelEngineConfig = {
  atrPeriod: 14,
  atrMultiplier: 1.5,
  swingStrength: 2,
  swingLookback: 60,
  srTolerancePct: 0.004,
  entryAtrFraction: 0.5,
  targetAtrMultiples: [1, 2, 3],
  maxRiskPct: 0.01,
  minCandles: 20,
  noiseAtrPctThreshold: 0.08,
};

/** Merge caller overrides over the defaults. */
export function resolveConfig(overrides?: Partial<LevelEngineConfig>): LevelEngineConfig {
  return { ...DEFAULT_LEVEL_CONFIG, ...(overrides ?? {}) };
}

/**
 * Resolve the reference price: explicit `referencePrice`, else the last candle
 * close, else 0 (no data — the no-trade policy at T010 turns this into an
 * explicit no-trade rather than a fake level).
 */
export function resolveReferencePrice(input: LevelEngineInput): number {
  if (input.referencePrice !== undefined) return input.referencePrice;
  const last = input.candles.at(-1);
  return last ? last.close : 0;
}

/**
 * Resolve the trade direction the entry/invalidation/target policies compute
 * for. Explicit `direction` wins; otherwise it is inferred deterministically
 * from the regime trend (trending_up → long, trending_down → short, anything
 * else → none). The LLM may still narrate a different stance, but the numbers
 * it cites are those computed for this engine-chosen direction.
 */
export function resolveDirection(input: LevelEngineInput): LevelDirection {
  if (input.direction) return input.direction;
  switch (input.regimeTrend) {
    case "trending_up":
      return "long";
    case "trending_down":
      return "short";
    default:
      return "none";
  }
}

/** A directional ("long"/"short") view of a resolved direction, or null for "none". */
export function tradeDirection(direction: LevelDirection): TradeDirection | null {
  return direction === "long" || direction === "short" ? direction : null;
}

/**
 * Compute deterministic levels for one asset. At T001 this is the minimal valid
 * result (reference price + direction, neutral entry zone); subsequent tasks
 * progressively populate the bands, structure, policies, and audit trail.
 */
export function computeLevels(input: LevelEngineInput): DeterministicLevels {
  const config = resolveConfig(input.config);
  const referencePrice = resolveReferencePrice(input);
  const direction = resolveDirection(input);
  const { candles } = input;

  const derivations: LevelDerivation[] = [
    {
      component: "reference_price",
      method: input.referencePrice !== undefined ? "explicit reference price" : "last candle close",
      inputs: { reference_price: referencePrice },
      outputs: [referencePrice],
    },
  ];

  // T002 — ATR and the reference ± multiplier·ATR volatility band.
  const vol = computeVolatilityBands(candles, referencePrice, config);
  if (vol) derivations.push(vol.derivation);

  return {
    reference_price: referencePrice,
    direction,
    entry_zone: { low: referencePrice, high: referencePrice },
    invalidation: referencePrice,
    targets: [],
    supports: [],
    resistances: [],
    ...(vol ? { atr: vol.atr, volatility_bands: vol.bands } : {}),
    liquidation_clusters: [],
    candidates: [],
    size_suggestion: null,
    derivations,
    method_notes: `level engine v1 (P12) — direction ${direction}`,
  };
}
