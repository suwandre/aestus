import { Decision, DecisionType } from "@aestus/contracts";
import { z } from "zod/v4";
import { respondError, respondList } from "../respond";
import type { FixtureStore } from "../store";
import type { Router } from "../router";

const CreateDecisionBody = z.object({
  briefing_id: z.string().min(1),
  decision_type: DecisionType,
  rationale: z.string().optional(),
  planned_entry: z.number().nullable().optional(),
  planned_stop: z.number().nullable().optional(),
  planned_targets: z.array(z.number()).optional(),
  risk_r: z.number().nullable().optional(),
  snooze_until: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const UpdateDecisionBody = z.object({
  rationale: z.string().optional(),
  tags: z.array(z.string()).optional(),
  snooze_until: z.string().optional(),
});

export function registerDecisionRoutes(router: Router, store: FixtureStore): void {
  // POST /api/decisions — log a user decision (hard rule #4)
  router.post("/api/decisions", async (req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respondError("Invalid JSON", 400);
    }
    const parsed = CreateDecisionBody.safeParse(body);
    if (!parsed.success) return respondError("Invalid request body", 400);

    const d = parsed.data;
    const decision: Decision = Decision.parse({
      id: `dec-${Date.now()}`,
      schema_version: 1,
      briefing_id: d.briefing_id,
      decision_type: d.decision_type,
      rationale: d.rationale,
      planned_entry: d.planned_entry ?? null,
      planned_stop: d.planned_stop ?? null,
      planned_targets: d.planned_targets ?? [],
      risk_r: d.risk_r ?? null,
      snooze_until: d.snooze_until,
      tags: d.tags ?? [],
      decided_at: new Date().toISOString(),
    });
    store.addDecision(decision);
    return Response.json(Decision.parse(decision), { status: 201 });
  });

  // PATCH /api/decisions/:id
  router.patch("/api/decisions/:id", async (req, params) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respondError("Invalid JSON", 400);
    }
    const parsed = UpdateDecisionBody.safeParse(body);
    if (!parsed.success) return respondError("Invalid request body", 400);
    const d = parsed.data;
    // Strip undefined values to satisfy exactOptionalPropertyTypes on Decision.
    const patch: Record<string, unknown> = {};
    if (d.rationale !== undefined) patch.rationale = d.rationale;
    if (d.tags !== undefined) patch.tags = d.tags;
    if (d.snooze_until !== undefined) patch.snooze_until = d.snooze_until;
    const updated = store.updateDecision(params.id, patch);
    if (!updated) return respondError("Decision not found", 404);
    return Response.json(Decision.parse(updated));
  });

  // GET /api/decisions
  router.get("/api/decisions", (_req, _params, url) => {
    let items = store.decisions;
    const briefingId = url.searchParams.get("briefing_id");
    if (briefingId) items = items.filter((d) => d.briefing_id === briefingId);
    const assetId = url.searchParams.get("asset_id");
    if (assetId) {
      const briefingIds = new Set(
        store.briefings
          .filter((b) => {
            const packets = store.contextPackets.filter(
              (p) => p.id === b.context_packet_id && p.primary_asset === assetId,
            );
            return packets.length > 0;
          })
          .map((b) => b.id),
      );
      items = items.filter((d) => briefingIds.has(d.briefing_id));
    }
    const date = url.searchParams.get("date");
    if (date) items = items.filter((d) => d.decided_at.startsWith(date));
    return respondList(Decision, items);
  });
}
