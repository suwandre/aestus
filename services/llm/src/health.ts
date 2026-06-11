/**
 * Health + metrics HTTP server for the LLM service (P13-T001).
 *
 * Mirrors the other services: `/health` reports status + dependencies,
 * `/metrics` exposes Prometheus counters. Cost is first-class here (hard rule
 * #7): token and USD totals are surfaced so the Cockpit cost widget and ops can
 * watch LLM spend against the €10–30/month envelope.
 */
import type { DependencyHealth } from "@aestus/contracts";

/** Mutable counters the service updates and the metrics endpoint renders. */
export interface LlmMetrics {
  /** Briefings that passed validation and were stored. */
  briefingsGenerated: number;
  /** Briefings that failed validation and were dropped (not stored/notified, T008). */
  rejected: number;
  /** Briefings successfully published on briefing.generated.<asset> (T011). */
  briefingsPublished: number;
  /** Packets served from cache without an LLM call (T012). */
  cacheHits: number;
  /** Completed LLM provider calls. */
  llmCalls: number;
  /** Cumulative prompt tokens across all calls. */
  promptTokens: number;
  /** Cumulative completion tokens across all calls. */
  completionTokens: number;
  /** Cumulative USD cost across all calls. */
  costUsd: number;
  errors: number;
  /** Epoch ms of the last context packet consumed (0 if none yet). */
  lastPacketEpochMs: number;
}

export function newMetrics(): LlmMetrics {
  return {
    briefingsGenerated: 0,
    rejected: 0,
    briefingsPublished: 0,
    cacheHits: 0,
    llmCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    errors: 0,
    lastPacketEpochMs: 0,
  };
}

export interface HealthServerOptions {
  service: string;
  version: string;
  port: number;
  startedAtMs: number;
  metrics: LlmMetrics;
  dependencies: () => DependencyHealth[];
}

interface HealthServer {
  stop(): void;
}

function renderMetrics(m: LlmMetrics, service: string): string {
  const l = `{service="${service}"}`;
  const lines = [
    "# HELP llm_briefings_total Briefings that passed validation and were stored.",
    "# TYPE llm_briefings_total counter",
    `llm_briefings_total${l} ${m.briefingsGenerated}`,
    "# HELP llm_briefings_rejected_total Briefings dropped by validation (not stored/notified).",
    "# TYPE llm_briefings_rejected_total counter",
    `llm_briefings_rejected_total${l} ${m.rejected}`,
    "# HELP llm_briefings_published_total Briefings published on briefing.generated.<asset>.",
    "# TYPE llm_briefings_published_total counter",
    `llm_briefings_published_total${l} ${m.briefingsPublished}`,
    "# HELP llm_cache_hits_total Packets served from cache without an LLM call.",
    "# TYPE llm_cache_hits_total counter",
    `llm_cache_hits_total${l} ${m.cacheHits}`,
    "# HELP llm_calls_total Completed LLM provider calls.",
    "# TYPE llm_calls_total counter",
    `llm_calls_total${l} ${m.llmCalls}`,
    "# HELP llm_prompt_tokens_total Cumulative prompt tokens.",
    "# TYPE llm_prompt_tokens_total counter",
    `llm_prompt_tokens_total${l} ${m.promptTokens}`,
    "# HELP llm_completion_tokens_total Cumulative completion tokens.",
    "# TYPE llm_completion_tokens_total counter",
    `llm_completion_tokens_total${l} ${m.completionTokens}`,
    "# HELP llm_cost_usd_total Cumulative USD cost across all calls.",
    "# TYPE llm_cost_usd_total counter",
    `llm_cost_usd_total${l} ${m.costUsd}`,
    "# HELP llm_errors_total Errors while generating briefings.",
    "# TYPE llm_errors_total counter",
    `llm_errors_total${l} ${m.errors}`,
    "# HELP llm_last_packet_epoch_ms Epoch ms of the last context packet consumed.",
    "# TYPE llm_last_packet_epoch_ms gauge",
    `llm_last_packet_epoch_ms${l} ${m.lastPacketEpochMs}`,
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
