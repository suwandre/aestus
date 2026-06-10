/**
 * Runtime configuration for the context-packet service (P11-T001).
 *
 * Everything is env-driven with fixture-first defaults: with no `NATS_URL` and
 * no `DATABASE_URL`, the service still assembles packets from the repo's JSON
 * fixtures and publishes them on an in-memory bus (hard rule #5). Fixture path
 * defaults resolve against the repo root so the service behaves the same when
 * launched from the repo root or from `services/context` (tests).
 */
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";

/** Repo root, derived from this file: services/context/src/config.ts → ../../../ */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Resolve a fixture path: absolute as-is, otherwise relative to the repo root. */
function resolveFixture(p: string): string {
  return isAbsolute(p) ? p : join(REPO_ROOT, p);
}

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

function envList(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface ContextConfig {
  /** Logical service name (envelope source + heartbeat subject token). */
  service: string;
  /** Service build/version string. */
  version: string;
  /** NATS server URL; unset → in-memory bus (fixture-first). */
  natsUrl: string | undefined;
  /** Postgres URL for packet persistence; unset → in-memory store. */
  databaseUrl: string | undefined;
  /** Heartbeat publish interval (ms). */
  heartbeatIntervalMs: number;
  /** Health/metrics HTTP port. */
  httpPort: number;
  /** Canonical asset ids to include as correlated-asset context. */
  correlatedAssets: string[];
  /** Only include news published within this many minutes of the anomaly. */
  newsWindowMinutes: number;
  /** Minimum news relevance score to include. */
  newsMinRelevance: number;
  /** Include macro events within this many hours either side of the anomaly. */
  macroWindowHours: number;
  /** Include on-chain events within this many hours before the anomaly. */
  onChainWindowHours: number;
  /** Seconds after which a contributing feed is considered stale. */
  freshnessStaleSeconds: number;
  /** Funding-rate spread across venues above which a dislocation is venue-specific. */
  venueFundingDispersion: number;
  /** Basis spread (bps) across venues above which a dislocation is venue-specific. */
  venueBasisDispersionBps: number;
  /** Fixture file locations (resolved absolute paths). */
  fixtures: {
    features: string;
    assets: string;
    news: string;
    macro: string;
    onChain: string;
    venueQuotes: string;
  };
}

/** Load configuration from the environment, applying fixture-first defaults. */
export function loadConfig(): ContextConfig {
  return {
    service: env("CONTEXT_SERVICE_NAME", "context"),
    version: env("CONTEXT_VERSION", "0.1.0"),
    natsUrl: process.env.NATS_URL || undefined,
    databaseUrl: process.env.DATABASE_URL || undefined,
    heartbeatIntervalMs: envInt("HEARTBEAT_INTERVAL_MS", 15_000),
    httpPort: envInt("HTTP_PORT", 8083),
    correlatedAssets: envList("CORRELATED_ASSETS", [
      "crypto:eth-usdt",
      "macro:spx",
      "macro:dxy",
      "macro:gold",
      "macro:vix",
    ]),
    newsWindowMinutes: envInt("NEWS_WINDOW_MINUTES", 240),
    newsMinRelevance: Number.parseFloat(env("NEWS_MIN_RELEVANCE", "0.5")),
    macroWindowHours: envInt("MACRO_WINDOW_HOURS", 72),
    onChainWindowHours: envInt("ONCHAIN_WINDOW_HOURS", 48),
    freshnessStaleSeconds: envInt("FRESHNESS_STALE_SECONDS", 900),
    venueFundingDispersion: Number.parseFloat(env("VENUE_FUNDING_DISPERSION", "0.0003")),
    venueBasisDispersionBps: Number.parseFloat(env("VENUE_BASIS_DISPERSION_BPS", "15")),
    fixtures: {
      features: resolveFixture(env("FEATURES_FIXTURE_PATH", "fixtures/features/snapshots.json")),
      assets: resolveFixture(env("ASSETS_FIXTURE_PATH", "fixtures/assets/identities.json")),
      news: resolveFixture(env("NEWS_FIXTURE_PATH", "fixtures/news/items.json")),
      macro: resolveFixture(env("MACRO_FIXTURE_PATH", "fixtures/macro/events.json")),
      onChain: resolveFixture(env("ONCHAIN_FIXTURE_PATH", "fixtures/onchain/events.json")),
      venueQuotes: resolveFixture(
        env("VENUE_QUOTES_FIXTURE_PATH", "fixtures/market/venue_quotes.json"),
      ),
    },
  };
}
