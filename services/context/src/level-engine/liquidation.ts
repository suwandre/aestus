/**
 * Liquidation cluster levels (P12-T004).
 *
 * Converts liquidation buckets (price band + total size + side) into candidate
 * levels: a cluster is a liquidity pool that tends to act as a price magnet. For
 * the resolved trade direction, pools beyond the reference are upside *targets*
 * and pools on the stop side are *context* (the invalidation policy at T007 may
 * pick one). Confidence scales with cluster size relative to the largest pool.
 * Deterministic; no LLM input (hard rule #2).
 */
import type { LevelCandidate, LevelDerivation, LevelDirection, LevelRole } from "@aestus/contracts";
import type { LiquidationCluster } from "./types";

/** Liquidation-derived candidates plus the flat representative-price list. */
export interface LiquidationResult {
  candidates: LevelCandidate[];
  /** Representative (mid-band) prices, nearest-to-reference first. */
  clusters: number[];
  derivation: LevelDerivation;
}

/** Role for a cluster at `price` given the reference and trade direction. */
function clusterRole(price: number, referencePrice: number, direction: LevelDirection): LevelRole {
  const above = price > referencePrice;
  // Long: upside pools are targets, downside pools are stop-side context.
  // Short: mirror. No direction: treat upside as target, downside as context.
  if (direction === "short") return above ? "context" : "target";
  return above ? "target" : "context";
}

/**
 * Build liquidation-cluster candidates. Each cluster's representative price is
 * its band midpoint; confidence is `0.4 + 0.5·(size / maxSize)` so the deepest
 * pool scores highest. Returns empty when there are no clusters.
 */
export function computeLiquidationLevels(
  clusters: LiquidationCluster[] | undefined,
  referencePrice: number,
  direction: LevelDirection,
): LiquidationResult {
  const list = clusters ?? [];
  if (list.length === 0) {
    return {
      candidates: [],
      clusters: [],
      derivation: {
        component: "liquidation_clusters",
        method: "no liquidation clusters available",
        inputs: {},
        outputs: [],
      },
    };
  }
  const maxSize = Math.max(...list.map((c) => c.total_size));
  const candidates: LevelCandidate[] = list.map((c) => {
    const price = (c.price_low + c.price_high) / 2;
    const confidence =
      maxSize > 0 ? Math.round((0.4 + 0.5 * (c.total_size / maxSize)) * 100) / 100 : 0.4;
    return {
      price,
      source: "liquidation_cluster",
      role: clusterRole(price, referencePrice, direction),
      confidence,
      note: `${c.side} liquidation cluster ${c.price_low}-${c.price_high} (size ${c.total_size})`,
    };
  });
  const sorted = [...candidates].sort(
    (a, b) => Math.abs(a.price - referencePrice) - Math.abs(b.price - referencePrice),
  );
  return {
    candidates,
    clusters: sorted.map((c) => c.price),
    derivation: {
      component: "liquidation_clusters",
      method: "band midpoint; size-weighted confidence; role by side of reference",
      inputs: { count: list.length, max_size: maxSize, reference_price: referencePrice },
      outputs: candidates.map((c) => c.price),
    },
  };
}
