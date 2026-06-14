/**
 * Numeric formatting utilities for Aestus UI.
 * No external dependencies — uses Intl.NumberFormat where appropriate.
 */

/** Format a price with thousands separators. Defaults to 2 decimal places. */
export function formatPrice(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format a percent with explicit sign. Defaults to 2 decimal places. */
export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Format basis points. */
export function formatBps(value: number): string {
  return `${Math.round(value)} bps`;
}

/** Format a funding rate with 4 decimal places and explicit sign. */
export function formatFunding(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(4)}%`;
}

/** Format a dollar notional with B/M/K suffix. */
export function formatNotional(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toPrecision(3).replace(/\.?0+$/, "")}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toPrecision(3).replace(/\.?0+$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toPrecision(3).replace(/\.?0+$/, "")}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

/** Format a compact number with B/M/K suffix (no $ prefix). */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toPrecision(3).replace(/\.?0+$/, "")}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toPrecision(3).replace(/\.?0+$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toPrecision(3).replace(/\.?0+$/, "")}K`;
  }
  return `${sign}${abs.toFixed(0)}`;
}

/** Format a sigma (standard deviation) value. */
export function formatSigma(value: number): string {
  return `${value.toFixed(1)}σ`;
}

/** Format a confidence value (0-100 integer). */
export function formatConfidence(value: number): string {
  return `${Math.round(value)}%`;
}

/** Format an R-multiple with explicit sign. */
export function formatRMultiple(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}R`;
}

/** Format an age in seconds into a human-readable string. */
export function formatAge(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
