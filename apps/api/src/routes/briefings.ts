import { Briefing } from "@aestus/contracts";
import { respondError, respondList } from "../respond";
import type { FixtureStore } from "../store";
import type { Router } from "../router";

export function registerBriefingRoutes(router: Router, store: FixtureStore): void {
  // GET /api/briefings
  router.get("/api/briefings", (_req, _params, url) => {
    let items = store.briefings;
    const asset = url.searchParams.get("asset");
    if (asset) {
      // filter by primary_asset via the context packet
      const packetIds = new Set(
        store.contextPackets.filter((p) => p.primary_asset === asset).map((p) => p.id),
      );
      items = items.filter((b) => packetIds.has(b.context_packet_id));
    }
    const stance = url.searchParams.get("stance");
    if (stance) items = items.filter((b) => b.stance === stance);
    const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
    items = items.slice(0, limit);
    return respondList(Briefing, items);
  });

  // GET /api/briefings/:id
  router.get("/api/briefings/:id", (_req, params) => {
    const briefing = store.briefings.find((b) => b.id === params.id);
    if (!briefing) return respondError("Briefing not found", 404);
    return Response.json(Briefing.parse(briefing));
  });

  // POST /api/briefings/:id/regenerate — enqueue a regeneration request
  router.post("/api/briefings/:id/regenerate", (_req, params) => {
    const briefing = store.briefings.find((b) => b.id === params.id);
    if (!briefing) return respondError("Briefing not found", 404);
    // In fixture mode this is a no-op: return the existing briefing + a note.
    return Response.json(
      { briefing: Briefing.parse(briefing), regenerating: true },
      { status: 202 },
    );
  });

  // GET /api/briefings/:id/context-packet — link to the context packet
  router.get("/api/briefings/:id/context-packet", (_req, params) => {
    const briefing = store.briefings.find((b) => b.id === params.id);
    if (!briefing) return respondError("Briefing not found", 404);
    const packet = store.contextPackets.find((p) => p.id === briefing.context_packet_id);
    if (!packet) return respondError("Context packet not found", 404);
    return Response.json(packet);
  });
}
