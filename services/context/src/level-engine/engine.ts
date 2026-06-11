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
import type {
  DeterministicLevels,
  LevelCandidate,
  LevelDerivation,
  LevelDirection,
} from "@aestus/contracts";
import type { LevelEngineConfig, LevelEngineInput, TradeDirection } from "./types";
import { computeVolatilityBands } from "./atr";
import { computeSwingStructure } from "./swing";
import { computeLiquidationLevels } from "./liquidation";
import { computeVolumeNodes } from "./support-resistance";
import { computeEntryZone } from "./entry";
import { computeInvalidation } from "./invalidation";
import { computeTargets } from "./target";

/** Collapse a price-sorted candidate group into representative prices: levels
 *  within `tol` of the running cluster merge, and the highest-confidence
 *  candidate's price represents the cluster (T005). */
function mergeByTolerance(group: LevelCandidate[], tol: number): number[] {
  if (group.length === 0) return [];
  const sorted = [...group].sort((a, b) => a.price - b.price);
  const out: number[] = [];
  let cluster: LevelCandidate[] = [sorted[0]!];
  const flush = () => {
    const best = cluster.reduce((m, c) => (c.confidence > m.confidence ? c : m));
    out.push(best.price);
  };
  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i]!;
    if (tol > 0 && c.price - cluster[cluster.length - 1]!.price <= tol) {
      cluster.push(c);
    } else {
      flush();
      cluster = [c];
    }
  }
  flush();
  return out;
}

/**
 * Project the flat support/resistance arrays from the accumulated candidates.
 * Levels of the same role within `tolerancePct × reference` are merged into one
 * node (represented by the highest-confidence member). Supports are returned
 * nearest-below-first (descending), resistances nearest-above-first (ascending).
 * Target/context/invalidation candidates are ignored — they project elsewhere.
 */
export function projectStructure(
  candidates: LevelCandidate[],
  referencePrice: number,
  tolerancePct: number,
): { supports: number[]; resistances: number[] } {
  const tol = referencePrice * tolerancePct;
  const supports = mergeByTolerance(
    candidates.filter((c) => c.role === "support"),
    tol,
  ).sort((a, b) => b - a);
  const resistances = mergeByTolerance(
    candidates.filter((c) => c.role === "resistance"),
    tol,
  ).sort((a, b) => a - b);
  return { supports, resistances };
}

/** Default engine tuning. Changing a value changes a formula, not the data. */
export const DEFAULT_LEVEL_CONFIG: LevelEngineConfig = {
  atrPeriod: 14,
  atrMultiplier: 1.5,
  swingStrength: 2,
  swingLookback: 60,
  srTolerancePct: 0.004,
  volumeNodeFactor: 1.8,
  entryAtrFraction: 0.5,
  invalidationAtrBuffer: 0.25,
  invalidationAtrMultiple: 1.0,
  targetAtrMultiples: [1, 2, 3],
  maxTargets: 5,
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

  // Accumulated price-level candidates (with source/role/confidence). Each
  // structural step appends to this; the flat support/resistance arrays are
  // projected from it at the end.
  const candidates: LevelCandidate[] = [];

  // T003 — swing structure → support/resistance candidates.
  const swing = computeSwingStructure(candles, referencePrice, config);
  candidates.push(...swing.candidates);
  derivations.push(swing.derivation);

  // T004 — liquidation clusters → target/context candidates + flat cluster list.
  const liq = computeLiquidationLevels(input.liquidationClusters, referencePrice, direction);
  candidates.push(...liq.candidates);
  derivations.push(liq.derivation);

  // T005 — high-volume nodes → additional support/resistance candidates.
  const volumeNodes = computeVolumeNodes(candles, referencePrice, config);
  candidates.push(...volumeNodes.candidates);
  derivations.push(volumeNodes.derivation);

  const { supports, resistances } = projectStructure(
    candidates,
    referencePrice,
    config.srTolerancePct,
  );

  // T006 — entry zone from direction + nearby structure + ATR.
  const entry = computeEntryZone(
    direction,
    referencePrice,
    vol?.atr,
    supports,
    resistances,
    config,
  );
  derivations.push(entry.derivation);

  // T007 — invalidation (stop basis) from structure/ATR, with source metadata.
  const inval = computeInvalidation(
    direction,
    referencePrice,
    entry.entryZone,
    vol?.atr,
    supports,
    resistances,
    candidates,
    config,
  );
  let invalidation = referencePrice;
  if (inval) {
    invalidation = inval.invalidation;
    candidates.push(inval.candidate);
    derivations.push(inval.derivation);
  }

  // T008 — profit targets from structure, ATR multiples, and liquidity clusters.
  const target = computeTargets(
    direction,
    referencePrice,
    entry.entryZone,
    vol?.atr,
    supports,
    resistances,
    candidates,
    config,
  );
  candidates.push(...target.candidates);
  derivations.push(target.derivation);

  return {
    reference_price: referencePrice,
    direction,
    entry_zone: entry.entryZone,
    invalidation,
    targets: target.targets,
    supports,
    resistances,
    ...(vol ? { atr: vol.atr, volatility_bands: vol.bands } : {}),
    liquidation_clusters: liq.clusters,
    candidates,
    size_suggestion: null,
    derivations,
    method_notes: `level engine v1 (P12) — direction ${direction}`,
  };
}
