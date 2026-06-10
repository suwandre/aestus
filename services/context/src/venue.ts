/**
 * Cross-venue comparison (P11-T004).
 *
 * Given per-venue quotes for one asset, compute funding/basis/price dispersion
 * and decide whether a dislocation is venue-specific (one venue diverging) or
 * market-wide (venues aligned). All deterministic — no LLM. The `notes` string
 * is a plain-language summary the briefing can quote directly.
 */
import type { VenueComparison, VenueQuote } from "@aestus/contracts";

export interface VenueThresholds {
  /** Funding-rate spread above which venues are "dislocated". */
  fundingDispersion: number;
  /** Basis spread (bps) above which venues are "dislocated". */
  basisDispersionBps: number;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Spread (max − min) over values, or null when fewer than two are present. */
function spread(values: number[]): number | null {
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

interface Reading {
  venue: string;
  funding: number | null;
  basis: number | null;
}

/** Pick the venue that diverges most from the median funding (then basis). */
function findOutlier(readings: Reading[]): string | null {
  const fundings = readings.filter((r) => r.funding !== null).map((r) => r.funding!);
  const bases = readings.filter((r) => r.basis !== null).map((r) => r.basis!);
  const medF = fundings.length >= 2 ? median(fundings) : null;
  const medB = bases.length >= 2 ? median(bases) : null;

  let best: { venue: string; dev: number } | null = null;
  for (const r of readings) {
    let dev = 0;
    if (medF !== null && r.funding !== null)
      dev = Math.abs(r.funding - medF) / (Math.abs(medF) || 1);
    if (medB !== null && r.basis !== null) {
      dev += Math.abs(r.basis - medB) / (Math.abs(medB) || 1);
    }
    if (best === null || dev > best.dev) best = { venue: r.venue, dev };
  }
  return best?.venue ?? null;
}

export function buildVenueComparison(
  asset: string,
  quotes: VenueQuote[],
  thresholds: VenueThresholds,
): VenueComparison {
  const readings: Reading[] = quotes.map((q) => ({
    venue: q.venue,
    funding: q.funding_rate,
    basis: q.basis_bps,
  }));

  const fundingDispersion = spread(
    quotes.filter((q) => q.funding_rate !== null).map((q) => q.funding_rate!),
  );
  const basisDispersion = spread(
    quotes.filter((q) => q.basis_bps !== null).map((q) => q.basis_bps!),
  );
  const prices = quotes.map((q) => q.price);
  const priceSpread = spread(prices);
  const meanPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const priceDispersion = priceSpread !== null && meanPrice !== 0 ? priceSpread / meanPrice : null;

  const fundingDislocated =
    fundingDispersion !== null && fundingDispersion > thresholds.fundingDispersion;
  const basisDislocated =
    basisDispersion !== null && basisDispersion > thresholds.basisDispersionBps;
  const isVenueSpecific = fundingDislocated || basisDislocated;
  const outlier = isVenueSpecific ? findOutlier(readings) : null;

  const n = quotes.length;
  const notes = isVenueSpecific
    ? `Cross-venue dislocation across ${n} venues` +
      (fundingDislocated && fundingDispersion !== null
        ? `; funding spread ${fundingDispersion.toFixed(5)}`
        : "") +
      (basisDislocated && basisDispersion !== null
        ? `; basis spread ${basisDispersion.toFixed(1)}bps`
        : "") +
      (outlier ? `; ${outlier} diverges most — likely venue-specific.` : ".")
    : `Readings aligned across ${n} venue(s)` +
      (fundingDispersion !== null ? ` (funding spread ${fundingDispersion.toFixed(5)})` : "") +
      `; dislocation looks market-wide, not venue-specific.`;

  return {
    asset,
    quotes,
    funding_dispersion: fundingDispersion,
    basis_dispersion_bps: basisDispersion,
    price_dispersion: priceDispersion,
    outlier_venue: outlier,
    is_venue_specific: isVenueSpecific,
    notes,
  };
}
