/**
 * SSE realtime endpoints (P15-T002, filtering P15-T004, broadcaster P15-T007).
 *
 * GET /api/realtime/stream — authenticated SSE stream of UI events.
 *
 * Query parameters (all optional, combinable):
 *   ?asset=id1,id2      — comma-separated canonical asset IDs to subscribe to
 *   ?venue=v1,v2        — comma-separated venue names to subscribe to
 *   ?watchlist=wl_id    — expand watchlist membership into asset filter
 *   ?tab=cockpit        — tab hint (stored in filter; unused in MVP matching logic)
 *
 * Filtering semantics:
 *   - Empty filter → full firehose (all data events delivered)
 *   - asset filter → only events whose asset_id / assets list intersects
 *   - venue filter → only events whose venue / venues list intersects
 *   - watchlist → resolved to member asset IDs, then merged into asset filter
 *   - Lifecycle events (connected, heartbeat, reconnect_required, degraded_mode)
 *     always pass through regardless of filter.
 *
 * POST /api/realtime/broadcast — dev-only endpoint (requires FIXTURE_BROADCASTER=1).
 * Accepts a BroadcastPayload JSON body and pushes it to all subscribers.
 * Used by the standalone broadcast.ts script to inject fixture events.
 *
 * The endpoint sits behind the same auth gate as the REST API.
 */
import type { ApiConfig } from "../config";
import type { BroadcastPayload, SubscriptionFilter } from "../realtime";
import type { RealtimeManager } from "../realtime";
import type { FixtureStore } from "../store";
import type { Router } from "../router";

export function registerRealtimeRoutes(
  router: Router,
  manager: RealtimeManager,
  store: FixtureStore,
  _config: ApiConfig,
): void {
  router.get("/api/realtime/stream", (_req, _params, url) => {
    return handleSse(url, manager, store);
  });

  // Dev-only broadcast endpoint: POST /api/realtime/broadcast
  // Only registered when FIXTURE_BROADCASTER=1. Accepts a BroadcastPayload JSON
  // body and delivers it to all matching subscribers via the RealtimeManager.
  if (process.env.FIXTURE_BROADCASTER === "1") {
    router.post("/api/realtime/broadcast", async (req) => {
      try {
        const payload = (await req.json()) as BroadcastPayload;
        manager.broadcast(payload);
        return Response.json({ ok: true });
      } catch {
        return Response.json({ error: "invalid payload" }, { status: 400 });
      }
    });
  }
}

function handleSse(url: URL, manager: RealtimeManager, store: FixtureStore): Response {
  const rawAssets = url.searchParams.get("asset");
  const rawVenues = url.searchParams.get("venue");
  const watchlistId = url.searchParams.get("watchlist");
  const tab = url.searchParams.get("tab") ?? undefined;

  // Start with explicit asset list
  const assetSet = new Set<string>(
    rawAssets
      ? rawAssets
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );

  // Expand watchlist members into the asset set
  if (watchlistId) {
    const wl = store.watchlists.find((w) => w.id === watchlistId);
    if (wl) {
      for (const member of wl.members) assetSet.add(member);
    }
  }

  const venueList = rawVenues
    ? rawVenues
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  // Build filter without undefined values (exactOptionalPropertyTypes)
  const filter: SubscriptionFilter = {};
  if (assetSet.size > 0) filter.assets = Array.from(assetSet);
  if (venueList && venueList.length > 0) filter.venues = venueList;
  if (tab) filter.tab = tab;

  let unsubscribe: (() => void) | undefined;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = manager.subscribe(filter, (event) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller closed — subscriber will be cleaned up via cancel()
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
