import {
  DependencyHealth,
  HealthStatus,
  SystemHealth,
  PAYLOAD_TYPES,
  SCHEMA_VERSION,
  SYSTEM_HEALTH,
  subject,
} from "@aestus/contracts";
import type { EventBus, Subscription } from "./types";

/**
 * Periodic service-health heartbeat publisher (P05-T009). A service starts one
 * of these to emit `SystemHealth` on `system.health.<service>` at a fixed
 * interval, so the Data tab can later render live service/dependency states.
 */
export interface HeartbeatOptions {
  /** Logical service name (also the envelope source and subject token). */
  service: string;
  /** Service build/version string. */
  version: string;
  /** Publish interval in milliseconds. */
  intervalMs: number;
  /** Returns the current dependency statuses each tick. */
  dependencies?: () => DependencyHealth[];
  /** Service start time (ms epoch). Defaults to now. */
  startedAtMs?: number;
  /** Injectable clock (ms epoch) for deterministic tests. */
  now?: () => number;
}

/** Overall status = worst dependency status (down > degraded > ok). */
function overallStatus(deps: DependencyHealth[]): HealthStatus {
  if (deps.some((d) => d.status === "down")) return "down";
  if (deps.some((d) => d.status === "degraded")) return "degraded";
  return "ok";
}

/** Build a `SystemHealth` record for the given options at time `nowMs`. */
export function buildHealth(opts: HeartbeatOptions, nowMs: number): SystemHealth {
  const startedAt = opts.startedAtMs ?? nowMs;
  const dependencies = opts.dependencies?.() ?? [];
  return {
    schema_version: SCHEMA_VERSION,
    service: opts.service,
    version: opts.version,
    status: overallStatus(dependencies),
    uptime_seconds: Math.max(0, Math.floor((nowMs - startedAt) / 1000)),
    dependencies,
  };
}

/** Build and publish a single heartbeat; returns the published record. */
export async function publishHealth(bus: EventBus, opts: HeartbeatOptions): Promise<SystemHealth> {
  const nowMs = (opts.now ?? (() => Date.now()))();
  const health = buildHealth(opts, nowMs);
  await bus.publish(subject(SYSTEM_HEALTH, opts.service), health, SystemHealth, {
    source: opts.service,
    payload_type: PAYLOAD_TYPES.SystemHealth,
  });
  return health;
}

/**
 * Start emitting heartbeats: one immediately, then every `intervalMs`. Returns a
 * {@link Subscription}; call `unsubscribe()` to stop the timer.
 */
export function startHeartbeat(bus: EventBus, opts: HeartbeatOptions): Subscription {
  const tick = () => {
    void publishHealth(bus, opts).catch((e) => console.error("heartbeat publish failed:", e));
  };
  tick();
  const timer = setInterval(tick, opts.intervalMs);
  return {
    unsubscribe: async () => {
      clearInterval(timer);
    },
  };
}
