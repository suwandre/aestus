/**
 * Target policy (P12-T008).
 *
 * Generates one or more profit targets for the trade direction from three
 * sources, each carrying a derivation label: structural levels (resistance for
 * longs, support for shorts), ATR multiples from the reference, and liquidity
 * (liquidation) clusters on the profit side. Targets are taken nearest-first,
 * merged within tolerance, and capped. Deterministic; no LLM input (hard rule #2).
 */
import type {
  EntryZone,
  LevelCandidate,
  LevelDerivation,
  LevelDirection,
  LevelSource,
} from "@aestus/contracts";
import type { LevelEngineConfig } from "./types";

/** Final targets, the new target-role candidates to add, and an audit derivation. */
export interface TargetResult {
  targets: number[];
  candidates: LevelCandidate[];
  derivation: LevelDerivation;
}

/** A candidate target with its derivation label, before merge/cap. */
interface Pick {
  price: number;
  source: LevelSource;
  confidence: number;
  /** Human-readable derivation label (e.g. "structure", "ref + 2·ATR"). */
  note: string;
}

/**
 * Compute profit targets. `supports`/`resistances` are the projected flat
 * arrays; `candidates` provides structural sources and the T004 liquidation
 * target candidates. Returns no targets when there is no direction.
 */
export function computeTargets(
  direction: LevelDirection,
  referencePrice: number,
  _entryZone: EntryZone,
  atr: number | undefined,
  supports: number[],
  resistances: number[],
  candidates: LevelCandidate[],
  config: LevelEngineConfig,
): TargetResult {
  if (direction === "none") {
    return {
      targets: [],
      candidates: [],
      derivation: {
        component: "targets",
        method: "no direction — no targets",
        inputs: {},
        outputs: [],
      },
    };
  }
  const a = atr ?? 0;
  const long = direction === "long";
  const onProfitSide = (price: number) => (long ? price > referencePrice : price < referencePrice);
  const picks: Pick[] = [];

  // 1) Structural targets (resistance for long, support for short).
  for (const price of long ? resistances : supports) {
    if (!onProfitSide(price)) continue;
    const role = long ? "resistance" : "support";
    const src = candidates.find((c) => c.price === price && c.role === role);
    picks.push({
      price,
      source: src?.source ?? (long ? "swing_high" : "swing_low"),
      confidence: src?.confidence ?? 0.5,
      note: "structure",
    });
  }
  // 2) ATR-multiple targets from the reference.
  if (a > 0) {
    for (const m of config.targetAtrMultiples) {
      const price = long ? referencePrice + m * a : referencePrice - m * a;
      picks.push({
        price,
        source: "atr_band",
        confidence: 0.5,
        note: `ref ${long ? "+" : "−"} ${m}·ATR`,
      });
    }
  }
  // 3) Liquidity clusters already marked target-role on the profit side (T004).
  for (const c of candidates) {
    if (c.role === "target" && onProfitSide(c.price)) {
      picks.push({
        price: c.price,
        source: c.source,
        confidence: c.confidence,
        note: "liquidity pool",
      });
    }
  }

  // Nearest-first, merge within tolerance (keep the nearest of a cluster), cap.
  picks.sort((x, y) => (long ? x.price - y.price : y.price - x.price));
  const tol = referencePrice * config.srTolerancePct;
  const merged: Pick[] = [];
  for (const p of picks) {
    const last = merged[merged.length - 1];
    if (!last || Math.abs(p.price - last.price) > tol) merged.push(p);
  }
  const capped = merged.slice(0, config.maxTargets);
  const targets = capped.map((p) => p.price);

  // Add target-role candidates only for prices not already target-role (the
  // liquidation picks already have one from T004); structural/ATR picks get one.
  const existing = new Set(candidates.filter((c) => c.role === "target").map((c) => c.price));
  const newCandidates: LevelCandidate[] = capped
    .filter((p) => !existing.has(p.price))
    .map((p) => ({
      price: p.price,
      source: p.source,
      role: "target",
      confidence: p.confidence,
      note: p.note,
    }));

  return {
    targets,
    candidates: newCandidates,
    derivation: {
      component: "targets",
      method: `${direction}: structure + ATR multiples + liquidity clusters; nearest-first, merged, capped at ${config.maxTargets}`,
      inputs: { atr: a, count: targets.length },
      outputs: targets,
    },
  };
}
