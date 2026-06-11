/**
 * Deterministic packet quality score (P11-T012).
 *
 * Derives a completeness/quality score from required-data presence and source
 * freshness (T009). Each feed contributes its weight at full credit when
 * present and fresh, half credit when present but stale, and nothing when
 * missing; the score is the weighted fraction. The primary market snapshot
 * dominates the weighting because a packet without it can't anchor a briefing.
 * The LLM prompt includes the result so the model can hedge on weak context,
 * and the UI warns when the label is `weak`. No LLM input — pure code.
 */
import type {
  FeedKind,
  PacketQuality,
  PacketQualityLabel,
  SourceFreshness,
} from "@aestus/contracts";

/** Per-feed weight; sums to 1. Market snapshot anchors the packet. */
const FEED_WEIGHTS: Record<FeedKind, number> = {
  market_snapshot: 0.5,
  correlated_assets: 0.1,
  venue_quotes: 0.1,
  news: 0.1,
  macro: 0.1,
  on_chain: 0.1,
};

function labelFor(score: number): PacketQualityLabel {
  if (score >= 0.75) return "strong";
  if (score >= 0.5) return "adequate";
  return "weak";
}

/** Credit a feed earns toward the score: fresh = full, stale = half, missing = none. */
function credit(f: SourceFreshness): number {
  if (!f.present) return 0;
  return f.stale ? 0.5 : 1;
}

/** Compute the quality score for a packet from its per-feed freshness. */
export function computePacketQuality(freshness: SourceFreshness[]): PacketQuality {
  let weighted = 0;
  let totalWeight = 0;
  const degraded: FeedKind[] = [];
  for (const f of freshness) {
    const weight = FEED_WEIGHTS[f.feed];
    totalWeight += weight;
    weighted += weight * credit(f);
    if (f.stale) degraded.push(f.feed); // stale = missing OR older than threshold (T009)
  }
  // Round to 2dp so the score is stable across runs and readable in the prompt.
  const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100) / 100;
  const label = labelFor(score);
  const notes =
    degraded.length === 0
      ? `Quality ${score.toFixed(2)} (${label}); all feeds present and fresh.`
      : `Quality ${score.toFixed(2)} (${label}); degraded feeds: ${degraded.join(", ")}.`;
  return { score, label, degraded_feeds: degraded, notes };
}
