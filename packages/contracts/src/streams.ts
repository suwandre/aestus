/**
 * Canonical NATS JetStream stream + subject definitions (P05-T001).
 *
 * This is the single source of truth for the event backbone topology. The
 * stream-init script, the TypeScript client helper, the Rust publisher, the
 * replay utility, and the inspection CLI all derive their subjects from here so
 * names never drift. The Rust mirror lives in `crates/event_model/src/streams.rs`
 * and MUST be kept in sync (there is no codegen between them yet).
 *
 * JetStream stream names cannot contain `.`, `*`, `>`, or spaces, so each
 * logical stream has an UPPER_SNAKE `name` while the dotted form lives in its
 * `subjects`. A stream captures the whole hierarchy under its base via the
 * `<base>.>` wildcard; producers append routing tokens (venue, canonical asset
 * id, or service name) after the base — see `docs/event_streams.md`.
 */

/** A single JetStream stream and the subject hierarchy it captures. */
export interface StreamDefinition {
  /** JetStream stream name (UPPER_SNAKE, no dots). */
  readonly name: string;
  /** Dotted subject base producers publish under, e.g. `raw.market`. */
  readonly base: string;
  /** Subjects bound to the stream — always `<base>.>` plus the bare base. */
  readonly subjects: readonly string[];
  /** Human description of what flows through the stream. */
  readonly description: string;
}

function define(name: string, base: string, description: string): StreamDefinition {
  // The bare base allows un-routed publishes (e.g. `system.health`); the
  // wildcard captures everything routed beneath it (`system.health.api`).
  return { name, base, subjects: [base, `${base}.>`], description };
}

/** Raw, source-traceable market messages before normalization. Carries `RawMarketEvent`. */
export const RAW_MARKET = define(
  "RAW_MARKET",
  "raw.market",
  "Raw market messages as ingested, one subject token per venue/symbol.",
);

/** Normalized market events. Carries `NormalizedMarketEvent`. */
export const NORMALIZED_MARKET = define(
  "NORMALIZED_MARKET",
  "normalized.market",
  "Normalized market events keyed by canonical asset id.",
);

/** Feature engine output. Carries `FeatureSnapshot`. */
export const FEATURE_SNAPSHOT = define(
  "FEATURE_SNAPSHOT",
  "feature.snapshot",
  "Deterministic feature snapshots per asset/timeframe.",
);

/** Detected anomalies. Carries `AnomalyEvent`. */
export const ANOMALY_DETECTED = define(
  "ANOMALY_DETECTED",
  "anomaly.detected",
  "Anomalies flagged by the detection engine.",
);

/** Assembled context packets for the LLM. Carries `ContextPacket`. */
export const CONTEXT_PACKET = define(
  "CONTEXT_PACKET",
  "context.packet",
  "Context packets assembled for briefing generation.",
);

/** Generated briefings (proposals, never commands). Carries `Briefing`. */
export const BRIEFING_GENERATED = define(
  "BRIEFING_GENERATED",
  "briefing.generated",
  "LLM-generated briefings (proposals with reasoning).",
);

/** Logged user decisions. Carries `Decision`. */
export const DECISION_LOGGED = define(
  "DECISION_LOGGED",
  "decision.logged",
  "User decisions (act/skip/snooze/dismiss/watch) with informing context.",
);

/** Periodic service health heartbeats. Carries `SystemHealth`. */
export const SYSTEM_HEALTH = define(
  "SYSTEM_HEALTH",
  "system.health",
  "Periodic per-service health heartbeats.",
);

/**
 * Dead-letter stream (P05-T006). Failed event handling is routed here as a
 * `DeadLetter` (original event + error metadata) so a poison message never
 * blocks its source stream. DLQ subjects are `dlq.<original-subject>`.
 */
export const DEAD_LETTER = define(
  "DLQ",
  "dlq",
  "Dead-lettered events with error metadata, for inspection and replay.",
);

/** Every stream in publish/topology order (DLQ last — it is operational). */
export const STREAMS: readonly StreamDefinition[] = [
  RAW_MARKET,
  NORMALIZED_MARKET,
  FEATURE_SNAPSHOT,
  ANOMALY_DETECTED,
  CONTEXT_PACKET,
  BRIEFING_GENERATED,
  DECISION_LOGGED,
  SYSTEM_HEALTH,
  DEAD_LETTER,
];

/**
 * Dead-letter subject for a failed event: `dlq.<original-subject>`. Keeps the
 * original routing visible so DLQ consumers can filter by it
 * (e.g. `dlq.raw.market.>`).
 */
export function deadLetterSubject(originalSubject: string): string {
  return `${DEAD_LETTER.base}.${originalSubject}`;
}

/** Look up a stream definition by its dotted base, e.g. `raw.market`. */
export function streamForBase(base: string): StreamDefinition | undefined {
  return STREAMS.find((s) => s.base === base);
}

/**
 * Build a fully-qualified subject from a stream base and routing tokens.
 * Tokens are sanitized to the NATS-safe charset (`a-z0-9_`); empties dropped.
 * Example: `subject(RAW_MARKET, "binance", "BTC-USDT")` → `raw.market.binance.btc_usdt`.
 */
export function subject(stream: StreamDefinition, ...tokens: string[]): string {
  const clean = tokens
    .map((t) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter((t) => t.length > 0);
  return [stream.base, ...clean].join(".");
}
