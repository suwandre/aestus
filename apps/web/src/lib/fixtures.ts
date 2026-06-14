/**
 * Fixture mode — allows the frontend to work without a live backend.
 * Enabled when NEXT_PUBLIC_FIXTURE_MODE === "1".
 */
import type {
  AssetIdentity as Asset,
  FeatureSnapshot,
  VenueQuote,
  AnomalyEvent as Anomaly,
  Briefing,
} from "@aestus/contracts";

export function isFixtureMode(): boolean {
  return process.env.NEXT_PUBLIC_FIXTURE_MODE === "1";
}

export const fixtureAssets: Asset[] = [
  {
    canonical_id: "btc-usd",
    symbol: "BTC-USD",
    base: "BTC",
    quote: "USD",
    asset_class: "crypto",
    display_name: "Bitcoin",
    icon_key: "btc",
    tags: ["crypto", "l1", "pow"],
  },
  {
    canonical_id: "eth-usd",
    symbol: "ETH-USD",
    base: "ETH",
    quote: "USD",
    asset_class: "crypto",
    display_name: "Ethereum",
    icon_key: "eth",
    tags: ["crypto", "l1", "pos"],
  },
  {
    canonical_id: "spx",
    symbol: "SPX",
    asset_class: "equity_index",
    display_name: "S&P 500",
    icon_key: "spx",
    tags: ["index", "macro", "us-equity"],
  },
];

export const fixtureTickers: Array<{
  asset_id: string;
  symbol: string;
  price: number;
  change_pct_24h: number;
}> = [
  { asset_id: "btc-usd", symbol: "BTC", price: 92450.0, change_pct_24h: 1.24 },
  { asset_id: "eth-usd", symbol: "ETH", price: 3210.5, change_pct_24h: -0.83 },
  { asset_id: "spx", symbol: "SPX", price: 5340.2, change_pct_24h: 0.31 },
  { asset_id: "dxy", symbol: "DXY", price: 104.12, change_pct_24h: -0.14 },
  { asset_id: "gold", symbol: "GOLD", price: 2348.0, change_pct_24h: 0.52 },
  { asset_id: "vix", symbol: "VIX", price: 18.4, change_pct_24h: -3.21 },
];

// Re-export contract types so callers importing from fixtures have them available.
export type { Asset, FeatureSnapshot, VenueQuote, Anomaly, Briefing };
