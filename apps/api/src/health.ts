import { type DependencyHealth, SystemHealth } from "@aestus/contracts";
import type { ApiConfig } from "./config";

export interface ApiMetrics {
  requests: number;
  errors: number;
}

export function newMetrics(): ApiMetrics {
  return { requests: 0, errors: 0 };
}

export function makeHealthResponse(
  config: ApiConfig,
  startedAtMs: number,
  dependencies: () => DependencyHealth[],
): unknown {
  const uptimeSeconds = Math.floor((Date.now() - startedAtMs) / 1000);
  const deps = dependencies();
  const worst = deps.find((d) => d.status === "down")
    ? "down"
    : deps.find((d) => d.status === "degraded")
      ? "degraded"
      : "ok";
  return SystemHealth.parse({
    schema_version: 1,
    service: config.service,
    version: config.version,
    status: worst,
    uptime_seconds: uptimeSeconds,
    dependencies: deps,
  });
}

export function renderMetrics(m: ApiMetrics, service: string): string {
  const l = `{service="${service}"}`;
  return [
    "# HELP api_requests_total Total HTTP requests handled.",
    "# TYPE api_requests_total counter",
    `api_requests_total${l} ${m.requests}`,
    "# HELP api_errors_total Total HTTP 5xx responses.",
    "# TYPE api_errors_total counter",
    `api_errors_total${l} ${m.errors}`,
    "",
  ].join("\n");
}
