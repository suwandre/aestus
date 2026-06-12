/**
 * OpenAPI 3.1 specification for the Aestus API (P14-T014).
 *
 * Generated from route definitions so frontend and future agents can inspect
 * API contracts without reading source code. Served at GET /openapi.json.
 */

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Aestus API",
    version: "0.1.0",
    description:
      "Decision-support cockpit API. Read-only market data + user-controlled mutations (decisions, journal). Never executes orders.",
  },
  servers: [{ url: "/", description: "Local server" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "API_TOKEN env var" },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { tags: ["system"], summary: "Service health", security: [] } },
    "/metrics": { get: { tags: ["system"], summary: "Prometheus metrics", security: [] } },
    "/openapi.json": { get: { tags: ["system"], summary: "This spec", security: [] } },

    "/api/assets": {
      get: {
        tags: ["assets"],
        summary: "List assets",
        parameters: [{ name: "asset_class", in: "query", schema: { type: "string" } }],
      },
    },
    "/api/assets/{id}": {
      get: {
        tags: ["assets"],
        summary: "Get asset by canonical_id",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      },
    },
    "/api/watchlists": { get: { tags: ["assets"], summary: "List watchlists" } },
    "/api/watchlists/{id}/members": {
      patch: {
        tags: ["assets"],
        summary: "Update watchlist members",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      },
    },
    "/api/watchlists/{id}/market-states": {
      get: {
        tags: ["assets"],
        summary: "Watchlist market states",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      },
    },

    "/api/market/latest/{asset_id}": {
      get: { tags: ["market"], summary: "Latest feature snapshot" },
    },
    "/api/market/venues/{asset_id}": { get: { tags: ["market"], summary: "Per-venue quotes" } },
    "/api/market/features/{asset_id}": { get: { tags: ["market"], summary: "Feature stack" } },
    "/api/market/correlations/{asset_id}": {
      get: { tags: ["market"], summary: "Correlation matrix" },
    },
    "/api/market/candles/{asset_id}": {
      get: {
        tags: ["market"],
        summary: "OHLCV candles",
        parameters: [
          { name: "timeframe", in: "query", schema: { type: "string", default: "1h" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
      },
    },

    "/api/anomalies": {
      get: {
        tags: ["anomalies"],
        summary: "List anomalies",
        parameters: [
          { name: "status", in: "query" },
          { name: "asset", in: "query" },
        ],
      },
    },
    "/api/anomalies/{id}": { get: { tags: ["anomalies"], summary: "Get anomaly detail" } },
    "/api/anomalies/{id}/status": {
      patch: { tags: ["anomalies"], summary: "Update anomaly status" },
    },
    "/api/anomalies/{id}/context": {
      get: { tags: ["anomalies"], summary: "Anomaly context refs" },
    },

    "/api/briefings": { get: { tags: ["briefings"], summary: "List briefings" } },
    "/api/briefings/{id}": { get: { tags: ["briefings"], summary: "Get briefing detail" } },
    "/api/briefings/{id}/regenerate": {
      post: { tags: ["briefings"], summary: "Enqueue briefing regeneration" },
    },
    "/api/briefings/{id}/context-packet": {
      get: { tags: ["briefings"], summary: "Get linked context packet" },
    },

    "/api/decisions": {
      get: { tags: ["decisions"], summary: "List decisions" },
      post: { tags: ["decisions"], summary: "Create decision (hard rule #4)" },
    },
    "/api/decisions/{id}": { patch: { tags: ["decisions"], summary: "Update decision" } },

    "/api/journal": {
      get: { tags: ["journal"], summary: "List journal trades" },
      post: { tags: ["journal"], summary: "Create manual journal entry" },
    },
    "/api/journal/{id}": { get: { tags: ["journal"], summary: "Get journal entry" } },
    "/api/journal/{id}/outcome": { patch: { tags: ["journal"], summary: "Update trade outcome" } },
    "/api/journal/tags": { get: { tags: ["journal"], summary: "List all setup tags" } },

    "/api/research": {
      get: { tags: ["research"], summary: "List research jobs" },
      post: { tags: ["research"], summary: "Submit research question" },
    },
    "/api/research/{id}": { get: { tags: ["research"], summary: "Poll research job status" } },

    "/api/analytics/kpi": { get: { tags: ["analytics"], summary: "KPI metrics from journal" } },
    "/api/analytics/equity-curve": { get: { tags: ["analytics"], summary: "Equity / R curve" } },
    "/api/analytics/setup-edge": { get: { tags: ["analytics"], summary: "Setup edge by tag" } },
    "/api/analytics/regime": { get: { tags: ["analytics"], summary: "Regime breakdown" } },
    "/api/analytics/signal-quality": {
      get: { tags: ["analytics"], summary: "Signal quality by anomaly type" },
    },

    "/api/data/health/sources": { get: { tags: ["data"], summary: "Source health" } },
    "/api/data/health/feeds": { get: { tags: ["data"], summary: "Feed list" } },
    "/api/data/health/feeds/{id}": { get: { tags: ["data"], summary: "Feed detail" } },
    "/api/data/explorer": { get: { tags: ["data"], summary: "Normalized data explorer" } },

    "/api/settings/watchlist": { get: { tags: ["settings"], summary: "List watchlist settings" } },
    "/api/settings/watchlist/{id}": {
      put: { tags: ["settings"], summary: "Update watchlist metadata" },
    },
    "/api/settings/alerts": { get: { tags: ["settings"], summary: "List alert rules" } },
    "/api/settings/alerts/{id}": { put: { tags: ["settings"], summary: "Upsert alert rule" } },
    "/api/settings/model-routing": { get: { tags: ["settings"], summary: "List model routes" } },
    "/api/settings/model-routing/{task_kind}": {
      put: { tags: ["settings"], summary: "Upsert model route" },
    },
    "/api/settings/feeds": { get: { tags: ["settings"], summary: "List feed settings" } },
    "/api/settings/feeds/{id}": { patch: { tags: ["settings"], summary: "Enable/disable feed" } },
    "/api/settings/notifications": {
      get: { tags: ["settings"], summary: "List notification channels" },
    },
    "/api/settings/notifications/{id}": {
      put: { tags: ["settings"], summary: "Upsert notification channel" },
    },
    "/api/settings/layout": {
      get: { tags: ["settings"], summary: "List layout preferences" },
      put: { tags: ["settings"], summary: "Set layout preference" },
    },
  },
} as const;

export function buildOpenApiSpec(): unknown {
  return SPEC;
}
