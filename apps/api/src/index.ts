/**
 * Aestus API server entrypoint (P14).
 *
 * Single Bun.serve() handles all routes: health/metrics (public), auth gate,
 * and all typed API endpoints. Fixture-first: works with zero secrets or live
 * databases — the FixtureStore loads from fixtures/ at startup.
 */
import type { DependencyHealth } from "@aestus/contracts";
import { checkAuth } from "./auth";
import { loadConfig } from "./config";
import { makeHealthResponse, newMetrics, renderMetrics } from "./health";
import { buildOpenApiSpec } from "./openapi";
import { Router } from "./router";
import { registerAssetRoutes } from "./routes/assets";
import { registerAnomalyRoutes } from "./routes/anomalies";
import { registerBriefingRoutes } from "./routes/briefings";
import { registerDecisionRoutes } from "./routes/decisions";
import { registerJournalRoutes } from "./routes/journal";
import { registerMarketRoutes } from "./routes/market";
import { registerResearchRoutes } from "./routes/research";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerDataRoutes } from "./routes/data";
import { registerSettingsRoutes } from "./routes/settings";
import { registerRealtimeRoutes } from "./routes/realtime";
import { RealtimeManager } from "./realtime";
import { FixtureStore } from "./store";

const config = loadConfig();
const startedAtMs = Date.now();
const metrics = newMetrics();
const store = new FixtureStore(config.repoRoot);
const router = new Router();
const realtime = new RealtimeManager(config.version);

// Register all routes
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
registerRealtimeRoutes(router, realtime, store, config);

const dependencies = (): DependencyHealth[] => [
  {
    name: "database",
    status: config.databaseUrl ? "ok" : "degraded",
    detail: config.databaseUrl ? "postgres" : "fixture (no DATABASE_URL)",
  },
  {
    name: "event-bus",
    status: config.natsUrl ? "ok" : "degraded",
    detail: config.natsUrl ? `nats ${config.natsUrl}` : "not connected (no NATS_URL)",
  },
];

const server = Bun.serve({
  port: config.httpPort,
  async fetch(req) {
    const url = new URL(req.url);

    // Public system endpoints
    if (url.pathname === "/health") {
      return Response.json(makeHealthResponse(config, startedAtMs, dependencies));
    }
    if (url.pathname === "/metrics") {
      return new Response(renderMetrics(metrics, config.service), {
        headers: { "content-type": "text/plain; version=0.0.4" },
      });
    }
    if (url.pathname === "/openapi.json") {
      return Response.json(buildOpenApiSpec());
    }

    // Auth gate for all other routes
    const authReject = checkAuth(req, config.apiToken);
    if (authReject) return authReject;

    metrics.requests++;
    try {
      return await router.handle(req);
    } catch (err) {
      metrics.errors++;
      console.error("[api] unhandled error:", err);
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
  },
  error(err) {
    console.error("[api] server error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  },
});

console.log(
  `[api] listening on :${config.httpPort} (db=${config.databaseUrl ? "postgres" : "fixture"}, auth=${config.apiToken ? "token" : "open"})`,
);

// Graceful shutdown
function shutdown() {
  console.log("[api] shutting down");
  realtime.notifyReconnectRequired("server shutdown");
  realtime.stop();
  server.stop(true);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
