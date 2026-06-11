/**
 * Health + metrics HTTP server for the context service (P11-T001).
 *
 * Mirrors the ingestion/feeds services: `/health` returns the current service
 * status and dependencies, `/metrics` exposes Prometheus counters. Lets the
 * Data tab (and ops) see whether the context builder is alive and processing.
 */
import type { DependencyHealth } from "@aestus/contracts";

/** Mutable counters the service updates and the metrics endpoint renders. */
export interface ContextMetrics {
  /** Packets successfully assembled (incremented before persist/publish). */
  packetsBuilt: number;
  /** Packets successfully published on `context.packet.<asset>` (T011). */
  packetsPublished: number;
  errors: number;
  /** Epoch ms of the last anomaly consumed (0 if none yet). */
  lastAnomalyEpochMs: number;
}

export function newMetrics(): ContextMetrics {
  return { packetsBuilt: 0, packetsPublished: 0, errors: 0, lastAnomalyEpochMs: 0 };
}

export interface HealthServerOptions {
  service: string;
  version: string;
  port: number;
  startedAtMs: number;
  metrics: ContextMetrics;
  dependencies: () => DependencyHealth[];
}

interface HealthServer {
  stop(): void;
}

function renderMetrics(m: ContextMetrics, service: string): string {
  const lines = [
    "# HELP context_packets_total Context packets successfully assembled.",
    "# TYPE context_packets_total counter",
    `context_packets_total{service="${service}"} ${m.packetsBuilt}`,
    "# HELP context_packets_published_total Context packets published on context.packet.<asset>.",
    "# TYPE context_packets_published_total counter",
    `context_packets_published_total{service="${service}"} ${m.packetsPublished}`,
    "# HELP context_errors_total Errors while assembling context packets.",
    "# TYPE context_errors_total counter",
    `context_errors_total{service="${service}"} ${m.errors}`,
    "# HELP context_last_anomaly_epoch_ms Epoch ms of the last anomaly consumed.",
    "# TYPE context_last_anomaly_epoch_ms gauge",
    `context_last_anomaly_epoch_ms{service="${service}"} ${m.lastAnomalyEpochMs}`,
  ];
  return lines.join("\n") + "\n";
}

/** Start the health/metrics HTTP server. */
export function startHealthServer(opts: HealthServerOptions): HealthServer {
  const server = Bun.serve({
    port: opts.port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health") {
        const deps = opts.dependencies();
        const status = deps.some((d) => d.status === "down")
          ? "down"
          : deps.some((d) => d.status === "degraded")
            ? "degraded"
            : "ok";
        return Response.json({
          service: opts.service,
          version: opts.version,
          status,
          uptime_seconds: Math.max(0, Math.floor((Date.now() - opts.startedAtMs) / 1000)),
          dependencies: deps,
        });
      }
      if (url.pathname === "/metrics") {
        return new Response(renderMetrics(opts.metrics, opts.service), {
          headers: { "content-type": "text/plain; version=0.0.4" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { stop: () => server.stop(true) };
}
