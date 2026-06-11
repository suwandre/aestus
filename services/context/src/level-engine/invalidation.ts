/**
 * Invalidation policy (P12-T007).
 *
 * Chooses the invalidation level (stop basis) for the trade direction. A long
 * is invalidated below the nearest support beneath the entry (minus an ATR
 * buffer), or — with no structure — a volatility stop an ATR multiple below the
 * entry. A short mirrors above resistance. Every directional invalidation
 * records explicit source metadata (which structural level, or the ATR stop).
 * Deterministic; no LLM input (hard rule #2).
 */
import type {
  EntryZone,
  LevelCandidate,
  LevelDerivation,
  LevelDirection,
  LevelSource,
} from "@aestus/contracts";
import type { LevelEngineConfig } from "./types";

/** Invalidation level, its provenance candidate, and an audit derivation. */
export interface InvalidationResult {
  invalidation: number;
  candidate: LevelCandidate;
  derivation: LevelDerivation;
}

/** Source + confidence of a structural level at `price`, if one is known. */
function structuralSource(
  candidates: LevelCandidate[],
  price: number,
  role: "support" | "resistance",
): { source: LevelSource; confidence: number } | undefined {
  const match = candidates.find((c) => c.role === role && c.price === price);
  return match ? { source: match.source, confidence: match.confidence } : undefined;
}

/**
 * Compute the invalidation for a directional thesis. Returns null when there is
 * no direction (the engine keeps a neutral reference invalidation and T010
 * marks no-trade). `supports` are nearest-below-first, `resistances`
 * nearest-above-first.
 */
export function computeInvalidation(
  direction: LevelDirection,
  referencePrice: number,
  entryZone: EntryZone,
  atr: number | undefined,
  supports: number[],
  resistances: number[],
  candidates: LevelCandidate[],
  config: LevelEngineConfig,
): InvalidationResult | null {
  if (direction === "none") return null;
  const a = atr ?? 0;
  const buffer = config.invalidationAtrBuffer * a;
  const volStop = config.invalidationAtrMultiple * a;

  let price: number;
  let source: LevelSource;
  let confidence: number;
  let method: string;
  const inputs: Record<string, number> = { atr: a, reference_price: referencePrice };

  if (direction === "long") {
    const support = supports.find((s) => s < entryZone.low);
    if (support !== undefined) {
      price = support - buffer;
      const struct = structuralSource(candidates, support, "support");
      source = struct?.source ?? "swing_low";
      confidence = struct?.confidence ?? 0.5;
      method = "below nearest support beneath entry, minus ATR buffer";
      inputs.support = support;
      inputs.buffer = buffer;
    } else {
      price = entryZone.low - volStop;
      source = "atr_band";
      confidence = 0.5;
      method = "volatility stop: entry low − multiple·ATR (no structure)";
      inputs.entry_low = entryZone.low;
      inputs.vol_stop = volStop;
    }
  } else {
    const resistance = resistances.find((r) => r > entryZone.high);
    if (resistance !== undefined) {
      price = resistance + buffer;
      const struct = structuralSource(candidates, resistance, "resistance");
      source = struct?.source ?? "swing_high";
      confidence = struct?.confidence ?? 0.5;
      method = "above nearest resistance above entry, plus ATR buffer";
      inputs.resistance = resistance;
      inputs.buffer = buffer;
    } else {
      price = entryZone.high + volStop;
      source = "atr_band";
      confidence = 0.5;
      method = "volatility stop: entry high + multiple·ATR (no structure)";
      inputs.entry_high = entryZone.high;
      inputs.vol_stop = volStop;
    }
  }

  return {
    invalidation: price,
    candidate: { price, source, role: "invalidation", confidence, note: method },
    derivation: {
      component: "invalidation",
      method: `${direction}: ${method}`,
      inputs,
      outputs: [price],
    },
  };
}
