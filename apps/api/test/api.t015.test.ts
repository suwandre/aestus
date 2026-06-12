/**
 * API integration tests (P14-T015).
 *
 * Exercises every MVP endpoint using fixture data — no live database, no LLM
 * provider keys required (hard rule #5). Uses a FixtureStore + Router directly
 * (no network) so tests are fast and deterministic.
 */
import { describe, expect, test, beforeAll } from "bun:test";
import { loadConfig } from "../src/config";
import { makeHealthResponse } from "../src/health";
import { checkAuth } from "../src/auth";
import { buildOpenApiSpec } from "../src/openapi";
import { Router } from "../src/router";
import { FixtureStore } from "../src/store";
import { registerAssetRoutes } from "../src/routes/assets";
import { registerMarketRoutes } from "../src/routes/market";
import { registerAnomalyRoutes } from "../src/routes/anomalies";
import { registerBriefingRoutes } from "../src/routes/briefings";
import { registerDecisionRoutes } from "../src/routes/decisions";
import { registerJournalRoutes } from "../src/routes/journal";
import { registerResearchRoutes } from "../src/routes/research";
import { registerAnalyticsRoutes } from "../src/routes/analytics";
import { registerDataRoutes } from "../src/routes/data";
import { registerSettingsRoutes } from "../src/routes/settings";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const config = loadConfig();
let store: FixtureStore;
let router: Router;

function makeRequest(method: string, path: string, body?: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function dispatch(method: string, path: string, body?: unknown): Promise<Response> {
  const req = makeRequest(method, path, body);
  return router.handle(req);
}

async function json(res: Response): Promise<unknown> {
  return res.json();
}

beforeAll(() => {
  store = new FixtureStore(config.repoRoot);
  router = new Router();
  registerAssetRoutes(router, store);
  registerMarketRoutes(router, store);
  registerAnomalyRoutes(router, store);
  registerBriefingRoutes(router, store);
  registerDecisionRoutes(router, store);
  registerJournalRoutes(router, store);
  registerResearchRoutes(router, store);
  registerAnalyticsRoutes(router, store);
  registerDataRoutes(router, store, config);
  registerSettingsRoutes(router, store);
});

// ─── T001: health + openapi ───────────────────────────────────────────────────

describe("P14-T001 skeleton", () => {
  test("health response conforms to SystemHealth schema", () => {
    const health = makeHealthResponse(config, Date.now() - 1000, () => [
      { name: "database", status: "degraded", detail: "fixture" },
    ]);
    expect(health).toMatchObject({ service: "api", status: "degraded", uptime_seconds: 1 });
  });

  test("openapi spec has required shape", () => {
    const spec = buildOpenApiSpec() as Record<string, unknown>;
    expect(spec.openapi).toBe("3.1.0");
    expect(typeof spec.paths).toBe("object");
    const paths = spec.paths as Record<string, unknown>;
    expect(paths["/health"]).toBeDefined();
    expect(paths["/api/assets"]).toBeDefined();
    expect(paths["/api/briefings"]).toBeDefined();
  });
});

// ─── T003: auth ───────────────────────────────────────────────────────────────

describe("P14-T003 auth", () => {
  test("no token configured → all requests pass", () => {
    const req = makeRequest("GET", "/api/assets");
    expect(checkAuth(req, undefined)).toBeNull();
  });

  test("token configured, no header → 401", () => {
    const req = makeRequest("GET", "/api/assets");
    const res = checkAuth(req, "secret");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  test("token configured, correct header → pass", () => {
    const req = makeRequest("GET", "/api/assets", undefined, "secret");
    expect(checkAuth(req, "secret")).toBeNull();
  });

  test("/health bypasses auth", () => {
    const req = makeRequest("GET", "/health");
    expect(checkAuth(req, "secret")).toBeNull();
  });

  test("/metrics bypasses auth", () => {
    const req = makeRequest("GET", "/metrics");
    expect(checkAuth(req, "secret")).toBeNull();
  });
});

// ─── T004: assets / watchlists ────────────────────────────────────────────────

describe("P14-T004 assets/watchlist", () => {
  test("GET /api/assets returns asset list", async () => {
    const res = await dispatch("GET", "/api/assets");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const first = body[0] as Record<string, unknown>;
    expect(typeof first.canonical_id).toBe("string");
    expect(typeof first.symbol).toBe("string");
  });

  test("GET /api/assets?asset_class=crypto filters", async () => {
    const res = await dispatch("GET", "/api/assets?asset_class=crypto");
    const body = (await json(res)) as Array<Record<string, unknown>>;
    expect(body.every((a) => a.asset_class === "crypto")).toBe(true);
  });

  test("GET /api/assets/:id returns specific asset", async () => {
    const res = await dispatch("GET", "/api/assets/crypto:btc-usdt");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.canonical_id).toBe("crypto:btc-usdt");
  });

  test("GET /api/assets/:id → 404 for unknown", async () => {
    const res = await dispatch("GET", "/api/assets/unknown:foo");
    expect(res.status).toBe(404);
  });

  test("GET /api/watchlists returns watchlists", async () => {
    const res = await dispatch("GET", "/api/watchlists");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  test("PATCH /api/watchlists/:id/members updates members", async () => {
    const res = await dispatch("PATCH", "/api/watchlists/default/members", {
      members: ["crypto:btc-usdt", "crypto:eth-usdt"],
    });
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.members).toEqual(["crypto:btc-usdt", "crypto:eth-usdt"]);
  });

  test("GET /api/watchlists/:id/market-states returns state per member", async () => {
    const res = await dispatch("GET", "/api/watchlists/default/market-states");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

// ─── T005: market state ───────────────────────────────────────────────────────

describe("P14-T005 market state", () => {
  test("GET /api/market/latest/:asset_id returns snapshot", async () => {
    const res = await dispatch("GET", "/api/market/latest/crypto:btc-usdt");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.canonical_asset_id).toBe("crypto:btc-usdt");
    expect(body.regime).toBeDefined();
  });

  test("GET /api/market/venues/:asset_id returns venue quotes", async () => {
    const res = await dispatch("GET", "/api/market/venues/crypto:btc-usdt");
    expect(res.status).toBe(200);
  });

  test("GET /api/market/correlations/:asset_id returns correlations", async () => {
    const res = await dispatch("GET", "/api/market/correlations/crypto:btc-usdt");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.correlations).toBeDefined();
  });

  test("GET /api/market/candles/:asset_id returns candles", async () => {
    const res = await dispatch("GET", "/api/market/candles/crypto:btc-usdt?timeframe=1h");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

// ─── T006: anomalies ──────────────────────────────────────────────────────────

describe("P14-T006 anomalies", () => {
  test("GET /api/anomalies lists anomalies", async () => {
    const res = await dispatch("GET", "/api/anomalies");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /api/anomalies?status=active filters by status", async () => {
    const res = await dispatch("GET", "/api/anomalies?status=active");
    const body = (await json(res)) as Array<Record<string, unknown>>;
    expect(body.every((a) => a.status === "active")).toBe(true);
  });

  test("GET /api/anomalies/:id returns anomaly detail", async () => {
    const res = await dispatch("GET", "/api/anomalies/anom-001");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.id).toBe("anom-001");
  });

  test("PATCH /api/anomalies/:id/status updates status", async () => {
    const res = await dispatch("PATCH", "/api/anomalies/anom-001/status", {
      status: "acknowledged",
    });
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.status).toBe("acknowledged");
  });

  test("GET /api/anomalies/:id/context returns context refs", async () => {
    const res = await dispatch("GET", "/api/anomalies/anom-001/context");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.context_refs).toBeDefined();
  });
});

// ─── T007: briefings ──────────────────────────────────────────────────────────

describe("P14-T007 briefings", () => {
  test("GET /api/briefings lists briefings", async () => {
    const res = await dispatch("GET", "/api/briefings");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /api/briefings/:id returns briefing detail", async () => {
    const res = await dispatch("GET", "/api/briefings/brief-001");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.id).toBe("brief-001");
    expect(body.cost_metadata).toBeDefined();
  });

  test("POST /api/briefings/:id/regenerate → 202", async () => {
    const res = await dispatch("POST", "/api/briefings/brief-001/regenerate");
    expect(res.status).toBe(202);
  });

  test("GET /api/briefings/:id/context-packet returns packet", async () => {
    const res = await dispatch("GET", "/api/briefings/brief-001/context-packet");
    expect(res.status).toBe(200);
  });
});

// ─── T008: decisions ──────────────────────────────────────────────────────────

describe("P14-T008 decisions", () => {
  test("GET /api/decisions lists decisions", async () => {
    const res = await dispatch("GET", "/api/decisions");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  test("POST /api/decisions creates a decision", async () => {
    const res = await dispatch("POST", "/api/decisions", {
      briefing_id: "brief-001",
      decision_type: "act",
      rationale: "Test act decision",
      planned_entry: 68000,
      planned_stop: 67000,
      planned_targets: [69500],
      risk_r: 1.5,
    });
    expect(res.status).toBe(201);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.decision_type).toBe("act");
    expect(body.briefing_id).toBe("brief-001");
  });

  test("GET /api/decisions?briefing_id filters", async () => {
    const res = await dispatch("GET", "/api/decisions?briefing_id=brief-001");
    const body = (await json(res)) as Array<Record<string, unknown>>;
    expect(body.every((d) => d.briefing_id === "brief-001")).toBe(true);
  });
});

// ─── T009: journal ────────────────────────────────────────────────────────────

describe("P14-T009 journal", () => {
  test("GET /api/journal/tags returns unique tags", async () => {
    const res = await dispatch("GET", "/api/journal/tags");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(Array.isArray(body.tags)).toBe(true);
  });

  test("GET /api/journal lists trades", async () => {
    const res = await dispatch("GET", "/api/journal");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /api/journal/:id returns trade", async () => {
    const res = await dispatch("GET", "/api/journal/trade-001");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.id).toBe("trade-001");
  });

  test("POST /api/journal creates manual entry", async () => {
    const res = await dispatch("POST", "/api/journal", {
      canonical_asset_id: "crypto:btc-usdt",
      side: "buy",
      entry: { price: 68000, at: "2026-06-12T10:00:00.000Z" },
      size: 0.1,
    });
    expect(res.status).toBe(201);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.outcome_status).toBe("open");
    expect(body.canonical_asset_id).toBe("crypto:btc-usdt");
  });

  test("PATCH /api/journal/:id/outcome updates outcome", async () => {
    const res = await dispatch("PATCH", "/api/journal/trade-001/outcome", {
      exit: { price: 70000, at: "2026-06-12T12:00:00.000Z" },
      realized_pnl: 300,
      r_multiple: 2.0,
      outcome_status: "win",
    });
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.outcome_status).toBe("win");
  });
});

// ─── T010: research ───────────────────────────────────────────────────────────

describe("P14-T010 research", () => {
  test("POST /api/research submits question and returns stub answer", async () => {
    const res = await dispatch("POST", "/api/research", {
      question: "What is the current BTC trend?",
    });
    expect(res.status).toBe(202);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.status).toBe("done");
    expect(typeof body.answer).toBe("string");
  });

  test("GET /api/research lists jobs", async () => {
    const res = await dispatch("GET", "/api/research");
    expect(res.status).toBe(200);
  });
});

// ─── T011: analytics ──────────────────────────────────────────────────────────

describe("P14-T011 analytics", () => {
  test("GET /api/analytics/kpi returns KPI object", async () => {
    const res = await dispatch("GET", "/api/analytics/kpi");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(typeof body.total_trades).toBe("number");
    expect(typeof body.win_rate).toBe("number");
    expect(typeof body.total_pnl).toBe("number");
  });

  test("GET /api/analytics/equity-curve returns array", async () => {
    const res = await dispatch("GET", "/api/analytics/equity-curve");
    expect(res.status).toBe(200);
    expect(Array.isArray(await json(res))).toBe(true);
  });

  test("GET /api/analytics/setup-edge returns array", async () => {
    const res = await dispatch("GET", "/api/analytics/setup-edge");
    expect(res.status).toBe(200);
    expect(Array.isArray(await json(res))).toBe(true);
  });

  test("GET /api/analytics/regime returns array", async () => {
    const res = await dispatch("GET", "/api/analytics/regime");
    expect(res.status).toBe(200);
    expect(Array.isArray(await json(res))).toBe(true);
  });

  test("GET /api/analytics/signal-quality returns array", async () => {
    const res = await dispatch("GET", "/api/analytics/signal-quality");
    expect(res.status).toBe(200);
    expect(Array.isArray(await json(res))).toBe(true);
  });
});

// ─── T012: data health ────────────────────────────────────────────────────────

describe("P14-T012 data health", () => {
  test("GET /api/data/health/sources returns source health", async () => {
    const res = await dispatch("GET", "/api/data/health/sources");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(Array.isArray(body.sources)).toBe(true);
  });

  test("GET /api/data/health/feeds returns feed list", async () => {
    const res = await dispatch("GET", "/api/data/health/feeds");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  test("GET /api/data/health/feeds/:id returns feed detail", async () => {
    const res = await dispatch("GET", "/api/data/health/feeds/binance");
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.feed_id).toBe("binance");
  });

  test("GET /api/data/explorer returns explorer data", async () => {
    const res = await dispatch("GET", "/api/data/explorer");
    expect(res.status).toBe(200);
  });
});

// ─── T013: settings ───────────────────────────────────────────────────────────

describe("P14-T013 settings", () => {
  test("GET /api/settings/watchlist returns watchlists", async () => {
    const res = await dispatch("GET", "/api/settings/watchlist");
    expect(res.status).toBe(200);
  });

  test("GET /api/settings/alerts returns alert rules", async () => {
    const res = await dispatch("GET", "/api/settings/alerts");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  test("PUT /api/settings/alerts/:id upserts rule", async () => {
    const res = await dispatch("PUT", "/api/settings/alerts/new-rule", {
      id: "new-rule",
      name: "My rule",
      condition: "volume_anomaly",
      params: { sigma: 2.5 },
    });
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.id).toBe("new-rule");
  });

  test("GET /api/settings/model-routing returns routes", async () => {
    const res = await dispatch("GET", "/api/settings/model-routing");
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  test("PUT /api/settings/model-routing/:task_kind upserts route", async () => {
    const res = await dispatch("PUT", "/api/settings/model-routing/briefing", {
      task_kind: "briefing",
      provider: "ollama",
      model: "kimi-k2.6",
    });
    expect(res.status).toBe(200);
  });

  test("GET /api/settings/feeds returns feed settings", async () => {
    const res = await dispatch("GET", "/api/settings/feeds");
    expect(res.status).toBe(200);
  });

  test("PATCH /api/settings/feeds/binance enables/disables feed", async () => {
    const res = await dispatch("PATCH", "/api/settings/feeds/binance", { enabled: false });
    expect(res.status).toBe(200);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body.enabled).toBe(false);
  });

  test("GET /api/settings/layout returns layout prefs", async () => {
    const res = await dispatch("GET", "/api/settings/layout");
    expect(res.status).toBe(200);
  });

  test("PUT /api/settings/layout sets a preference", async () => {
    const res = await dispatch("PUT", "/api/settings/layout", {
      key: "theme",
      value: "light",
    });
    expect(res.status).toBe(200);
  });

  test("GET /api/settings/notifications returns channels", async () => {
    const res = await dispatch("GET", "/api/settings/notifications");
    expect(res.status).toBe(200);
  });
});

// ─── T014: OpenAPI ────────────────────────────────────────────────────────────

describe("P14-T014 openapi", () => {
  test("spec lists all major path groups", () => {
    const spec = buildOpenApiSpec() as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths);
    expect(paths.some((p) => p.startsWith("/api/assets"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/anomalies"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/briefings"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/decisions"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/journal"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/analytics"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/settings"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/api/data"))).toBe(true);
  });
});
