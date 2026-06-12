import { AnomalyEvent, AnomalyStatus } from "@aestus/contracts";
import { z } from "zod/v4";
import { respondError, respondList } from "../respond";
import type { FixtureStore } from "../store";
import type { Router } from "../router";

const UpdateStatusBody = z.object({ status: AnomalyStatus });

export function registerAnomalyRoutes(router: Router, store: FixtureStore): void {
  // GET /api/anomalies
  router.get("/api/anomalies", (_req, _params, url) => {
    let items = store.anomalies;
    const status = url.searchParams.get("status");
    if (status) items = items.filter((a) => a.status === status);
    const asset = url.searchParams.get("asset");
    if (asset) items = items.filter((a) => a.assets.includes(asset));
    const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
    items = items.slice(0, limit);
    return respondList(AnomalyEvent, items);
  });

  // GET /api/anomalies/:id
  router.get("/api/anomalies/:id", (_req, params) => {
    const anomaly = store.anomalies.find((a) => a.id === params.id);
    if (!anomaly) return respondError("Anomaly not found", 404);
    return Response.json(AnomalyEvent.parse(anomaly));
  });

  // PATCH /api/anomalies/:id/status
  router.patch("/api/anomalies/:id/status", async (req, params) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respondError("Invalid JSON", 400);
    }
    const parsed = UpdateStatusBody.safeParse(body);
    if (!parsed.success) return respondError("Invalid status value", 400);
    const updated = store.updateAnomalyStatus(params.id, parsed.data.status);
    if (!updated) return respondError("Anomaly not found", 404);
    return Response.json(AnomalyEvent.parse(updated));
  });

  // GET /api/anomalies/:id/context — context refs for the anomaly
  router.get("/api/anomalies/:id/context", (_req, params) => {
    const anomaly = store.anomalies.find((a) => a.id === params.id);
    if (!anomaly) return respondError("Anomaly not found", 404);
    // Resolve context refs to packets if they match
    const packets = anomaly.context_refs
      .map((ref) => store.contextPackets.find((p) => p.id === ref))
      .filter(Boolean);
    return Response.json({ context_refs: anomaly.context_refs, packets });
  });
}
