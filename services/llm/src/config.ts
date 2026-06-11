/**
 * Runtime configuration for the LLM orchestration service (P13-T001).
 *
 * Everything is env-driven with fixture-first defaults (hard rule #5): with no
 * `OLLAMA_API_KEY` the service uses the deterministic fake provider, with no
 * `NATS_URL` an in-memory bus, and with no `DATABASE_URL` an in-memory briefing
 * store — so the full packet → briefing pipeline runs with zero secrets.
 *
 * The runtime LLM provider decision (progress.md, binding) routes top-tier
 * reasoning (briefings) to Kimi K2.6 and high-volume narrow tasks (extraction /
 * classification) to MiniMax M2.7, both on Ollama Cloud behind a swappable
 * provider abstraction. Exact `:cloud` model tags are config-driven so they can
 * be confirmed against the live catalog without a code change.
 */
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

export interface LlmConfig {
  /** Logical service name (envelope source + heartbeat subject token). */
  service: string;
  /** Service build/version string. */
  version: string;
  /** NATS server URL; unset → in-memory bus (fixture-first). */
  natsUrl: string | undefined;
  /** Postgres URL for briefing persistence; unset → in-memory store. */
  databaseUrl: string | undefined;
  /** Heartbeat publish interval (ms). */
  heartbeatIntervalMs: number;
  /** Health/metrics HTTP port. */
  httpPort: number;
  /** Ollama Cloud base URL (OpenAI-compatible); used only when an API key is set. */
  ollamaBaseUrl: string;
  /** Ollama Cloud API key; unset → deterministic fake provider (fixture-first). */
  ollamaApiKey: string | undefined;
  /** Per-LLM-call timeout (ms). */
  requestTimeoutMs: number;
  /** Max retries on a transient provider failure. */
  maxRetries: number;
  /**
   * Do not regenerate a briefing for the same anomaly signature within this
   * many minutes unless the context materially changes (T012 cache policy).
   */
  cacheCooldownMinutes: number;
}

/** Load configuration from the environment, applying fixture-first defaults. */
export function loadConfig(): LlmConfig {
  return {
    service: env("LLM_SERVICE_NAME", "llm"),
    version: env("LLM_VERSION", "0.1.0"),
    natsUrl: process.env.NATS_URL || undefined,
    databaseUrl: process.env.DATABASE_URL || undefined,
    heartbeatIntervalMs: envInt("HEARTBEAT_INTERVAL_MS", 15_000),
    httpPort: envInt("HTTP_PORT", 8085),
    ollamaBaseUrl: env("OLLAMA_BASE_URL", "https://ollama.com/v1"),
    ollamaApiKey: process.env.OLLAMA_API_KEY || undefined,
    requestTimeoutMs: envInt("LLM_REQUEST_TIMEOUT_MS", 30_000),
    maxRetries: envInt("LLM_MAX_RETRIES", 2),
    cacheCooldownMinutes: envInt("LLM_CACHE_COOLDOWN_MINUTES", 30),
  };
}
