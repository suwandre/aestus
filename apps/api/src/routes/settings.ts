import { z } from "zod/v4";
import { respondError } from "../respond";
import type { FixtureStore, AlertRule, ModelRoute, NotificationChannel } from "../store";
import type { Router } from "../router";

const UpdateWatchlistSettingsBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

const AlertRuleBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  asset: z.string().nullable().optional(),
  condition: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
});

const ModelRouteBody = z.object({
  task_kind: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

const FeedSettingBody = z.object({ enabled: z.boolean() });

const NotificationChannelBody = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  target: z.string().min(1),
  enabled: z.boolean(),
});

const LayoutPrefBody = z.object({ key: z.string().min(1), value: z.unknown() });

async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return respondError("Invalid JSON", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) return respondError("Invalid request body", 400);
  return result.data;
}

export function registerSettingsRoutes(router: Router, store: FixtureStore): void {
  // ─── Watchlist settings ───────────────────────────────────────────────────

  router.get("/api/settings/watchlist", () => {
    return Response.json(store.watchlists);
  });

  router.put("/api/settings/watchlist/:id", async (req, params) => {
    const result = await parseBody(req, UpdateWatchlistSettingsBody);
    if (result instanceof Response) return result;
    const wl = store.watchlists.find((w) => w.id === params.id);
    if (!wl) return respondError("Watchlist not found", 404);
    if (result.name !== undefined) wl.name = result.name;
    if (result.description !== undefined) wl.description = result.description;
    return Response.json(wl);
  });

  // ─── Alert rules ──────────────────────────────────────────────────────────

  router.get("/api/settings/alerts", () => {
    return Response.json(store.alertRules);
  });

  router.put("/api/settings/alerts/:id", async (req, params) => {
    const result = await parseBody(req, AlertRuleBody);
    if (result instanceof Response) return result;
    const rule: AlertRule = {
      id: params.id,
      name: result.name,
      asset: result.asset ?? null,
      condition: result.condition,
      params: result.params as Record<string, unknown>,
    };
    store.upsertAlertRule(rule);
    return Response.json(rule);
  });

  // ─── Model routing ────────────────────────────────────────────────────────

  router.get("/api/settings/model-routing", () => {
    return Response.json(store.modelRoutes);
  });

  router.put("/api/settings/model-routing/:task_kind", async (req, params) => {
    const result = await parseBody(req, ModelRouteBody);
    if (result instanceof Response) return result;
    const route: ModelRoute = {
      task_kind: params.task_kind,
      provider: result.provider,
      model: result.model,
      params: (result.params as Record<string, unknown>) ?? {},
    };
    store.upsertModelRoute(route);
    return Response.json(route);
  });

  // ─── Feed settings ────────────────────────────────────────────────────────

  router.get("/api/settings/feeds", () => {
    return Response.json(store.feedSettings);
  });

  router.patch("/api/settings/feeds/:id", async (req, params) => {
    const result = await parseBody(req, FeedSettingBody);
    if (result instanceof Response) return result;
    const updated = store.updateFeedSetting(params.id, result.enabled);
    if (!updated) return respondError("Feed not found", 404);
    return Response.json(updated);
  });

  // ─── Notifications ────────────────────────────────────────────────────────

  router.get("/api/settings/notifications", () => {
    return Response.json(store.notifications);
  });

  router.put("/api/settings/notifications/:id", async (req, params) => {
    const result = await parseBody(req, NotificationChannelBody);
    if (result instanceof Response) return result;
    const channel: NotificationChannel = {
      id: params.id,
      type: result.type,
      target: result.target,
      enabled: result.enabled,
    };
    store.upsertNotificationChannel(channel);
    return Response.json(channel);
  });

  // ─── Layout preferences ───────────────────────────────────────────────────

  router.get("/api/settings/layout", () => {
    return Response.json(store.layout);
  });

  router.put("/api/settings/layout", async (req) => {
    const result = await parseBody(req, LayoutPrefBody);
    if (result instanceof Response) return result;
    store.setLayoutPreference(result.key as string, result.value);
    return Response.json(store.layout);
  });
}
