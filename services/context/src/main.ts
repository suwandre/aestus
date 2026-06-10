/**
 * Context service entrypoint (P11-T001).
 *
 * Wires the event bus (NATS when `NATS_URL` is set, otherwise an in-memory bus
 * for fixture-first/standalone runs), starts the heartbeat and health server,
 * and begins consuming anomalies. Shuts down cleanly on SIGINT/SIGTERM.
 */
import { type DependencyHealth } from "@aestus/contracts";
import { type EventBus, InMemoryBus, NatsBus, startHeartbeat } from "@aestus/event-bus";
import { loadConfig } from "./config";
import { newMetrics, startHealthServer } from "./health";
import { startContextService } from "./service";
import { FixtureDataSource } from "./data/fixtures";

async function main(): Promise<void> {
  const config = loadConfig();
  const startedAtMs = Date.now();
  const metrics = newMetrics();

  const bus: EventBus = config.natsUrl
    ? await NatsBus.connect(config.natsUrl)
    : new InMemoryBus();
  const busMode = config.natsUrl ? "nats" : "memory";
  console.log(`[context] starting (bus=${busMode}) v${config.version}`);

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

  const dataSource = new FixtureDataSource(config);
  const sub = await startContextService({ bus, config, metrics, dataSource });
  console.log(`[context] consuming anomalies; health on :${config.httpPort}`);

  const shutdown = async () => {
    console.log("[context] shutting down");
    await sub.unsubscribe();
    await heartbeat.unsubscribe();
    health.stop();
    await bus.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((err) => {
  console.error("[context] fatal:", err);
  process.exit(1);
});
