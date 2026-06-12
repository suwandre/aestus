import { AssetIdentity } from "@aestus/contracts";
import { z } from "zod/v4";
import { respondError, respondList } from "../respond";
import type { FixtureStore, Watchlist } from "../store";
import type { Router } from "../router";

const WatchlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  members: z.array(z.string()),
});

const WatchlistMembersBody = z.object({
  members: z.array(z.string()),
});

export function registerAssetRoutes(router: Router, store: FixtureStore): void {
  // GET /api/assets
  router.get("/api/assets", (_req, _params, url) => {
    let items = store.assets;
    const cls = url.searchParams.get("asset_class");
    if (cls) items = items.filter((a) => a.asset_class === cls);
    return respondList(AssetIdentity, items);
  });

  // GET /api/assets/:id
  router.get("/api/assets/:id", (_req, params) => {
    const asset = store.assets.find((a) => a.canonical_id === params.id);
    if (!asset) return respondError("Asset not found", 404);
    return (AssetIdentity.parse(asset), Response.json(AssetIdentity.parse(asset)));
  });

  // GET /api/watchlists
  router.get("/api/watchlists", () => {
    return respondList(WatchlistSchema, store.watchlists);
  });

  // PATCH /api/watchlists/:id/members
  router.patch("/api/watchlists/:id/members", async (req, params) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respondError("Invalid JSON", 400);
    }
    const parsed = WatchlistMembersBody.safeParse(body);
    if (!parsed.success) return respondError("Invalid request body", 400);
    // validate all members exist
    for (const m of parsed.data.members) {
      if (!store.assets.find((a) => a.canonical_id === m))
        return respondError(`Unknown asset: ${m}`, 400);
    }
    const updated = store.updateWatchlistMembers(params.id, parsed.data.members);
    if (!updated) return respondError("Watchlist not found", 404);
    return Response.json(WatchlistSchema.parse(updated));
  });

  // GET /api/watchlists/:id/market-states
  router.get("/api/watchlists/:id/market-states", (_req, params) => {
    const wl = store.watchlists.find((w) => w.id === params.id) as Watchlist | undefined;
    if (!wl) return respondError("Watchlist not found", 404);
    const states = wl.members.map((canonId) => {
      const asset = store.assets.find((a) => a.canonical_id === canonId);
      const snapshot = store.features.find((f) => f.canonical_asset_id === canonId);
      return { asset, snapshot };
    });
    return Response.json(states);
  });
}
