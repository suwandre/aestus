import { z } from "zod/v4";
import { Id, SchemaVersion } from "./common";

/**
 * Service health (P05-T009). Each service publishes these periodically on
 * `system.health.<service>` so the Data tab can later render live service
 * states and dependency health.
 */
export const HealthStatus = z.enum(["ok", "degraded", "down"]);
export type HealthStatus = z.infer<typeof HealthStatus>;

/** Health of one upstream/downstream dependency (NATS, Postgres, a provider, …). */
export const DependencyHealth = z.object({
  name: Id,
  status: HealthStatus,
  /** Optional human detail, e.g. an error or latency note. */
  detail: z.string().optional(),
});
export type DependencyHealth = z.infer<typeof DependencyHealth>;

export const SystemHealth = z.object({
  schema_version: SchemaVersion,
  /** Logical service name, e.g. `ingestion` (matches the envelope `source`). */
  service: Id,
  /** Service build/version string. */
  version: z.string().min(1),
  /** Overall status, typically the worst of the dependencies. */
  status: HealthStatus,
  /** Seconds since the service started. */
  uptime_seconds: z.number().int().nonnegative(),
  /** Per-dependency health. */
  dependencies: z.array(DependencyHealth).default([]),
});
export type SystemHealth = z.infer<typeof SystemHealth>;
