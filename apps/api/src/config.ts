import { join } from "node:path";

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface ApiConfig {
  service: string;
  version: string;
  httpPort: number;
  /** Bearer token for single-user auth; undefined = no auth required (dev). */
  apiToken: string | undefined;
  databaseUrl: string | undefined;
  natsUrl: string | undefined;
  /** Repo root for resolving fixture paths. */
  repoRoot: string;
}

export function loadConfig(): ApiConfig {
  // apps/api/src → up 3 levels → repo root
  const repoRoot = join(import.meta.dir, "..", "..", "..");
  return {
    service: env("API_SERVICE_NAME", "api"),
    version: env("API_VERSION", "0.1.0"),
    httpPort: envInt("HTTP_PORT", 8090),
    apiToken: process.env.API_TOKEN || undefined,
    databaseUrl: process.env.DATABASE_URL || undefined,
    natsUrl: process.env.NATS_URL || undefined,
    repoRoot,
  };
}
