/**
 * LLM orchestration service entrypoint (P13-T001).
 *
 * Wires the event bus (NATS when `NATS_URL` is set, otherwise an in-memory bus
 * for fixture-first/standalone runs), the deterministic fake provider (the real
 * Ollama Cloud provider + routing land in T002/T004), the in-memory briefing
 * store (Postgres in T010), and the heartbeat + health server. Begins consuming
 * context packets. Shuts down cleanly on SIGINT/SIGTERM.
 */
import { type DependencyHealth } from "@aestus/contracts";
import { type EventBus, InMemoryBus, NatsBus, startHeartbeat } from "@aestus/event-bus";
import { BriefingCache } from "./cache";
import { loadConfig } from "./config";
import { newMetrics, startHealthServer } from "./health";
import { createProvider } from "./provider";
import { loadRouting } from "./routing";
import { startLlmService } from "./service";
import { InMemoryBriefingStore, type BriefingStore } from "./store";
import { PostgresBriefingStore } from "./store-postgres";

async function main(): Promise<void> {
  const config = loadConfig();
  const startedAtMs = Date.now();
  const metrics = newMetrics();

  const bus: EventBus = config.natsUrl ? await NatsBus.connect(config.natsUrl) : new InMemoryBus();
  const busMode = config.natsUrl ? "nats" : "memory";
  console.log(`[llm] starting (bus=${busMode}) v${config.version}`);

  // Ollama Cloud when OLLAMA_API_KEY is set; deterministic fake otherwise.
  const provider = createProvider(config);

  const dependencies = (): DependencyHealth[] => [
    {
      name: "event-bus",
      status: config.natsUrl ? "ok" : "degraded",
      detail: config.natsUrl ? `nats ${config.natsUrl}` : "in-memory (no NATS_URL)",
    },
    {
      name: "store",
      status: config.databaseUrl ? "ok" : "degraded",
      detail: config.databaseUrl ? "postgres" : "in-memory (no DATABASE_URL)",
    },
    {
      name: "llm-provider",
      status: config.ollamaApiKey ? "ok" : "degraded",
      detail: config.ollamaApiKey
        ? `ollama (${provider.name})`
        : "fake (deterministic; no OLLAMA_API_KEY)",
    },
  ];

  const health = startHealthServer({
    service: config.service,
    version: config.version,
    port: config.httpPort,
    startedAtMs,
    metrics,
    dependencies,
  });

  const heartbeat = startHeartbeat(bus, {
    service: config.service,
    version: config.version,
    intervalMs: config.heartbeatIntervalMs,
    startedAtMs,
    dependencies,
  });

  // Postgres when DATABASE_URL is set; in-memory otherwise (fixture-first).
  const store: BriefingStore = config.databaseUrl
    ? new PostgresBriefingStore(config.databaseUrl)
    : new InMemoryBriefingStore();
  const routing = await loadRouting(config);
  const cache = new BriefingCache(config.cacheCooldownMinutes * 60_000);
  const sub = await startLlmService({ bus, config, metrics, provider, store, routing, cache });
  const briefingModel = routing.resolve("briefing").model;
  console.log(
    `[llm] consuming context packets (provider=${provider.name}, briefing model=${briefingModel}); health on :${config.httpPort}`,
  );

  const shutdown = async () => {
    console.log("[llm] shutting down");
    await sub.unsubscribe();
    await heartbeat.unsubscribe();
    health.stop();
    await store.close();
    await bus.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((err) => {
  console.error("[llm] fatal:", err);
  process.exit(1);
});
