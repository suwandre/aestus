import type { FixtureStore } from "../store";
import type { Router } from "../router";
import { respondError } from "../respond";
import type { ApiConfig } from "../config";

export function registerDataRoutes(router: Router, store: FixtureStore, config: ApiConfig): void {
  // GET /api/data/health/sources — overall source health derived from feed settings
  router.get("/api/data/health/sources", () => {
    const sources = store.feedSettings.map((f) => ({
      source: f.feed_id,
      status: f.enabled ? "ok" : "disabled",
      last_event: null,
    }));
    return Response.json({
      database: config.databaseUrl ? "postgres" : "fixture",
      nats: config.natsUrl ?? null,
      sources,
    });
  });

  // GET /api/data/health/feeds — list all feeds
  router.get("/api/data/health/feeds", () => {
    return Response.json(store.feedSettings);
  });

  // GET /api/data/health/feeds/:id — feed detail
  router.get("/api/data/health/feeds/:id", (_req, params) => {
    const feed = store.feedSettings.find((f) => f.feed_id === params.id);
    if (!feed) return respondError("Feed not found", 404);
    return Response.json({ ...feed, last_event: null, event_count: 0 });
  });

  // GET /api/data/explorer — normalized data explorer
  router.get("/api/data/explorer", (_req, _params, url) => {
    const asset = url.searchParams.get("asset");
    const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
    let quotes = store.venueQuotes;
    if (asset) quotes = quotes.filter((q) => q.canonical_asset_id === asset);
    quotes = quotes.slice(0, limit);
    return Response.json({ venue_quotes: quotes, candle_count: store.candles.length });
  });
}
