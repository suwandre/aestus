import { JournalTrade, OutcomeStatus, Side, TradeLeg } from "@aestus/contracts";
import { z } from "zod/v4";
import { respondError, respondList } from "../respond";
import type { FixtureStore } from "../store";
import type { Router } from "../router";

const CreateTradeBody = z.object({
  canonical_asset_id: z.string().min(1),
  side: Side,
  entry: z.object({ price: z.number(), at: z.string() }),
  size: z.number().positive(),
  fees: z.number().nonnegative().optional(),
  setup_tags: z.array(z.string()).optional(),
  signal: z.string().optional(),
  linked_briefing_id: z.string().nullable().optional(),
});

const UpdateOutcomeBody = z.object({
  exit: z.object({ price: z.number(), at: z.string() }).optional(),
  realized_pnl: z.number().optional(),
  r_multiple: z.number().optional(),
  outcome_status: OutcomeStatus.optional(),
  fees: z.number().nonnegative().optional(),
});

export function registerJournalRoutes(router: Router, store: FixtureStore): void {
  // GET /api/journal/tags — must be registered before /:id to avoid param capture
  router.get("/api/journal/tags", () => {
    const tags = new Set<string>();
    for (const trade of store.journal) {
      for (const tag of trade.setup_tags) tags.add(tag);
    }
    return Response.json({ tags: Array.from(tags).sort() });
  });

  // GET /api/journal
  router.get("/api/journal", (_req, _params, url) => {
    let items = store.journal;
    const asset = url.searchParams.get("asset");
    if (asset) items = items.filter((j) => j.canonical_asset_id === asset);
    const status = url.searchParams.get("outcome_status");
    if (status) items = items.filter((j) => j.outcome_status === status);
    const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
    items = items.slice(0, limit);
    return respondList(JournalTrade, items);
  });

  // GET /api/journal/:id
  router.get("/api/journal/:id", (_req, params) => {
    const trade = store.journal.find((j) => j.id === params.id);
    if (!trade) return respondError("Journal entry not found", 404);
    return Response.json(JournalTrade.parse(trade));
  });

  // POST /api/journal — create manual entry
  router.post("/api/journal", async (req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respondError("Invalid JSON", 400);
    }
    const parsed = CreateTradeBody.safeParse(body);
    if (!parsed.success) return respondError("Invalid request body", 400);
    const d = parsed.data;
    const entry = TradeLeg.parse({ price: d.entry.price, at: d.entry.at });
    const trade: JournalTrade = JournalTrade.parse({
      id: `trade-${Date.now()}`,
      schema_version: 1,
      canonical_asset_id: d.canonical_asset_id,
      side: d.side,
      entry,
      exit: null,
      size: d.size,
      fees: d.fees ?? 0,
      realized_pnl: null,
      r_multiple: null,
      outcome_status: "open",
      setup_tags: d.setup_tags ?? [],
      signal: d.signal,
      linked_briefing_id: d.linked_briefing_id ?? null,
    });
    store.addJournalEntry(trade);
    return Response.json(JournalTrade.parse(trade), { status: 201 });
  });

  // PATCH /api/journal/:id/outcome — update trade outcome
  router.patch("/api/journal/:id/outcome", async (req, params) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respondError("Invalid JSON", 400);
    }
    const parsed = UpdateOutcomeBody.safeParse(body);
    if (!parsed.success) return respondError("Invalid request body", 400);
    const d = parsed.data;
    // Build patch without undefined values (exactOptionalPropertyTypes).
    const patch: Record<string, unknown> = {};
    if (d.exit !== undefined) patch.exit = TradeLeg.parse(d.exit);
    if (d.realized_pnl !== undefined) patch.realized_pnl = d.realized_pnl;
    if (d.r_multiple !== undefined) patch.r_multiple = d.r_multiple;
    if (d.outcome_status !== undefined) patch.outcome_status = d.outcome_status;
    if (d.fees !== undefined) patch.fees = d.fees;
    const updated = store.updateJournalOutcome(params.id, patch);
    if (!updated) return respondError("Journal entry not found", 404);
    return Response.json(JournalTrade.parse(updated));
  });
}
