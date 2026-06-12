import { FeatureSnapshot, Ohlcv, VenueQuote } from "@aestus/contracts";
import { respondError, respondList } from "../respond";
import type { FixtureStore } from "../store";
import type { Router } from "../router";

export function registerMarketRoutes(router: Router, store: FixtureStore): void {
  // GET /api/market/latest/:asset_id — latest feature snapshot
  router.get("/api/market/latest/:asset_id", (_req, params) => {
    const snap = store.features.find((f) => f.canonical_asset_id === params.asset_id);
    if (!snap) return respondError("No market state for asset", 404);
    return Response.json(FeatureSnapshot.parse(snap));
  });

  // GET /api/market/venues/:asset_id — per-venue quotes for comparison
  router.get("/api/market/venues/:asset_id", (_req, params, url) => {
    let quotes = store.venueQuotes.filter((q) => q.canonical_asset_id === params.asset_id);
    const venue = url.searchParams.get("venue");
    if (venue) quotes = quotes.filter((q) => q.venue === venue);
    return respondList(VenueQuote, quotes);
  });

  // GET /api/market/features/:asset_id — same as latest but named for the feature-stack UI
  router.get("/api/market/features/:asset_id", (_req, params) => {
    const snap = store.features.find((f) => f.canonical_asset_id === params.asset_id);
    if (!snap) return respondError("No feature snapshot for asset", 404);
    return Response.json(FeatureSnapshot.parse(snap));
  });

  // GET /api/market/correlations/:asset_id — correlation matrix for the asset
  router.get("/api/market/correlations/:asset_id", (_req, params) => {
    const snap = store.features.find((f) => f.canonical_asset_id === params.asset_id);
    if (!snap) return respondError("No data for asset", 404);
    return Response.json({
      canonical_asset_id: params.asset_id,
      correlations: snap.correlation_set,
    });
  });

  // GET /api/market/candles/:asset_id — OHLCV candles
  router.get("/api/market/candles/:asset_id", (_req, params, url) => {
    const tf = url.searchParams.get("timeframe") ?? "1h";
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(Number.parseInt(limitParam, 10) || 200, 1000) : 200;
    let candles = store.candles.filter(
      (c) => c.canonical_asset_id === params.asset_id && c.timeframe === tf,
    );
    candles = candles.slice(-limit);
    return respondList(Ohlcv, candles);
  });
}
