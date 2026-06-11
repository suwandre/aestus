/**
 * Support/resistance from high-volume nodes (P12-T005).
 *
 * Complements the swing pivots (T003) with simple volume-profile nodes: a
 * candle whose volume is well above the series mean marks a price level where
 * significant trade occurred, which tends to act as support/resistance. Each
 * node becomes a {@link LevelCandidate} with source `volume_node` and a
 * volume-weighted confidence. Deterministic; no LLM input (hard rule #2).
 */
import type { LevelCandidate, LevelDerivation } from "@aestus/contracts";
import type { Candle, LevelEngineConfig } from "./types";

/** Volume-node candidates plus an audit derivation. */
export interface VolumeNodeResult {
  candidates: LevelCandidate[];
  derivation: LevelDerivation;
}

/**
 * Find high-volume nodes: candles whose volume is at least
 * `volumeNodeFactor × mean volume`. The node's price is the candle close; its
 * role is support (≤ reference) or resistance (> reference); confidence scales
 * with volume relative to the busiest candle.
 */
export function computeVolumeNodes(
  candles: Candle[],
  referencePrice: number,
  config: LevelEngineConfig,
): VolumeNodeResult {
  const empty: VolumeNodeResult = {
    candidates: [],
    derivation: {
      component: "support_resistance",
      method: "high-volume nodes (none above threshold)",
      inputs: {},
      outputs: [],
    },
  };
  if (candles.length === 0) return empty;
  const totalVol = candles.reduce((sum, c) => sum + c.volume, 0);
  const meanVol = totalVol / candles.length;
  const maxVol = Math.max(...candles.map((c) => c.volume));
  if (meanVol <= 0 || maxVol <= 0) return empty;

  const threshold = config.volumeNodeFactor * meanVol;
  const candidates: LevelCandidate[] = candles
    .filter((c) => c.volume >= threshold)
    .map((c) => ({
      price: c.close,
      source: "volume_node",
      role: c.close > referencePrice ? "resistance" : "support",
      confidence: Math.round((0.4 + 0.5 * (c.volume / maxVol)) * 100) / 100,
      note: `high-volume node (vol ${c.volume})`,
    }));

  return {
    candidates,
    derivation: {
      component: "support_resistance",
      method: `high-volume nodes ≥ ${config.volumeNodeFactor}× mean volume`,
      inputs: { mean_volume: meanVol, threshold, count: candidates.length },
      outputs: candidates.map((c) => c.price),
    },
  };
}
