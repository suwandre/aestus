/**
 * Placeholder deterministic levels (P11-T001).
 *
 * Hard rule #2: price levels are computed by code, never invented by the LLM.
 * The real deterministic level/risk engine is P12 — until it lands, the context
 * packet carries an explicit placeholder so the shape is valid and downstream
 * consumers can detect that levels are not yet computed (reference_price 0 and
 * the `method_notes` marker). P12 replaces this module's output wholesale.
 */
import type { DeterministicLevels } from "@aestus/contracts";

export const PLACEHOLDER_LEVELS_NOTE =
  "placeholder — deterministic level/risk engine (P12) not yet wired";

/**
 * Build placeholder levels around an optional reference price. With no price
 * available the zone collapses to the reference (0), which the marker note and
 * a quality check (T012) flag as missing data — never as a real level.
 */
export function placeholderLevels(referencePrice = 0): DeterministicLevels {
  return {
    reference_price: referencePrice,
    entry_zone: { low: referencePrice, high: referencePrice },
    invalidation: referencePrice,
    targets: [],
    supports: [],
    resistances: [],
    liquidation_clusters: [],
    method_notes: PLACEHOLDER_LEVELS_NOTE,
  };
}
