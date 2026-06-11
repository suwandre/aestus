/**
 * Entry zone policy (P12-T006).
 *
 * Converts the trade direction plus nearby structure and volatility into a
 * numeric entry range. Longs look to enter on a pullback toward the nearest
 * support; shorts on a bounce toward the nearest resistance; the zone half-width
 * is a fraction of ATR. With no direction the zone collapses to the reference
 * (the no-trade policy at T010 covers that case). Deterministic; no LLM input.
 */
import type { EntryZone, LevelDerivation, LevelDirection } from "@aestus/contracts";
import type { LevelEngineConfig } from "./types";

/** Entry zone plus an audit derivation. */
export interface EntryZoneResult {
  entryZone: EntryZone;
  derivation: LevelDerivation;
}

/**
 * Compute the entry zone. `atr` sizes the half-width (`entryAtrFraction·ATR`);
 * `supports`/`resistances` are the flat projected arrays (nearest-first). A
 * long anchors on a support within `2·halfWidth` below the reference (else a
 * shallow pullback below it); a short mirrors on resistance.
 */
export function computeEntryZone(
  direction: LevelDirection,
  referencePrice: number,
  atr: number | undefined,
  supports: number[],
  resistances: number[],
  config: LevelEngineConfig,
): EntryZoneResult {
  const halfWidth = (atr ?? 0) * config.entryAtrFraction;
  let low = referencePrice;
  let high = referencePrice;
  let basis = "neutral (no direction) — entry collapses to reference";

  if (direction === "long") {
    const support = supports.find((s) => s < referencePrice && referencePrice - s <= 2 * halfWidth);
    if (support !== undefined) {
      low = support;
      high = Math.min(referencePrice, support + halfWidth);
      basis = "long: pullback to nearest support within 2·halfWidth";
    } else {
      low = referencePrice - halfWidth;
      high = referencePrice;
      basis = "long: shallow pullback below reference";
    }
  } else if (direction === "short") {
    const resistance = resistances.find(
      (r) => r > referencePrice && r - referencePrice <= 2 * halfWidth,
    );
    if (resistance !== undefined) {
      high = resistance;
      low = Math.max(referencePrice, resistance - halfWidth);
      basis = "short: bounce to nearest resistance within 2·halfWidth";
    } else {
      low = referencePrice;
      high = referencePrice + halfWidth;
      basis = "short: shallow bounce above reference";
    }
  }

  if (low > high) [low, high] = [high, low];
  return {
    entryZone: { low, high },
    derivation: {
      component: "entry_zone",
      method: `${basis}; half-width = ${config.entryAtrFraction}·ATR`,
      inputs: { atr: atr ?? 0, half_width: halfWidth, reference_price: referencePrice },
      outputs: [low, high],
    },
  };
}
