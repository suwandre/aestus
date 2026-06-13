/**
 * SSE realtime endpoint (P15-T002).
 *
 * GET /api/realtime/stream — authenticated SSE stream of UI events.
 *
 * Query parameters (all optional):
 *   ?asset=id1,id2    — comma-separated canonical asset IDs to subscribe to
 *   ?venue=v1,v2      — comma-separated venue names to subscribe to
 *   ?tab=cockpit      — tab hint for future optimization (currently unused)
 *
 * The endpoint is behind the same auth gate as the REST API. When API_TOKEN
 * is unset (dev/fixture mode), all requests are allowed.
 */
import type { ApiConfig } from "../config";
import type { RealtimeManager } from "../realtime";
import type { Router } from "../router";

export function registerRealtimeRoutes(
  router: Router,
  manager: RealtimeManager,
  _config: ApiConfig,
): void {
  router.get("/api/realtime/stream", (_req, _params, url) => {
    return handleSse(url, manager);
  });
}

function handleSse(url: URL, manager: RealtimeManager): Response {
  // Parse subscription filter from query params
  const rawAssets = url.searchParams.get("asset");
  const rawVenues = url.searchParams.get("venue");
  const tab = url.searchParams.get("tab") ?? undefined;

  const assetList = rawAssets ? rawAssets.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const venueList = rawVenues ? rawVenues.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  // Build filter without undefined values (exactOptionalPropertyTypes)
  const filter: import("../realtime").SubscriptionFilter = {};
  if (assetList) filter.assets = assetList;
  if (venueList) filter.venues = venueList;
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
