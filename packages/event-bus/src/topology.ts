import { STREAMS } from "@aestus/contracts";

/**
 * Declarative JetStream topology (P05-T005): the streams and durable consumers
 * the backbone needs. These are pure, testable derivations of the canonical
 * stream definitions in `@aestus/contracts`; the `nats-init` script applies them
 * idempotently so the setup is reproducible after a JetStream reset.
 *
 * JetStream is the in-flight transport buffer, NOT the durable store —
 * ClickHouse/Postgres hold history (see `docs/data_retention.md`). Stream
 * retention is therefore short; tune via the overrides below.
 */

const DAY = 24 * 60 * 60;
const MIB = 1024 * 1024;

/** Default retention when a stream has no override. */
export const DEFAULT_MAX_AGE_SECONDS = 7 * DAY;
export const DEFAULT_MAX_BYTES = 512 * MIB;

/** Per-stream retention overrides, keyed by JetStream stream name. */
const RETENTION_OVERRIDES: Record<string, { maxAgeSeconds?: number; maxBytes?: number }> = {
  // High-volume feeds: keep a short buffer; ClickHouse is the system of record.
  RAW_MARKET: { maxAgeSeconds: 3 * DAY, maxBytes: 2048 * MIB },
  NORMALIZED_MARKET: { maxAgeSeconds: 3 * DAY, maxBytes: 2048 * MIB },
  // Heartbeats are ephemeral and tiny.
  SYSTEM_HEALTH: { maxAgeSeconds: 1 * DAY, maxBytes: 64 * MIB },
};

/** Stream creation spec (file-backed, age/size-limited). */
export interface StreamSpec {
  name: string;
  subjects: string[];
  maxAgeSeconds: number;
  maxBytes: number;
}

/** Durable pull-consumer spec bound to a stream. */
export interface ConsumerSpec {
  stream: string;
  durableName: string;
  description: string;
}

/** Build the stream specs from the canonical definitions + retention overrides. */
export function buildStreamSpecs(): StreamSpec[] {
  return STREAMS.map((s) => {
    const override = RETENTION_OVERRIDES[s.name] ?? {};
    return {
      name: s.name,
      subjects: [...s.subjects],
      maxAgeSeconds: override.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
      maxBytes: override.maxBytes ?? DEFAULT_MAX_BYTES,
    };
  });
}

/**
 * Durable consumers, one per downstream stage in the pipeline (mirrors the
 * producer → consumer flow documented in `docs/event_streams.md`). Each is a
 * durable pull consumer so a restarted service resumes where it left off.
 */
export const CONSUMERS: ConsumerSpec[] = [
  {
    stream: "RAW_MARKET",
    durableName: "normalizer",
    description: "Normalizes raw market messages.",
  },
  {
    stream: "NORMALIZED_MARKET",
    durableName: "features",
    description: "Feeds the feature engine.",
  },
  { stream: "FEATURE_SNAPSHOT", durableName: "anomalies", description: "Feeds anomaly detection." },
  { stream: "FEATURE_SNAPSHOT", durableName: "context", description: "Feeds context assembly." },
  {
    stream: "ANOMALY_DETECTED",
    durableName: "context-anomalies",
    description: "Anomaly input to context assembly.",
  },
  {
    stream: "CONTEXT_PACKET",
    durableName: "briefing",
    description: "Drives LLM briefing generation.",
  },
  {
    stream: "BRIEFING_GENERATED",
    durableName: "api",
    description: "Delivers briefings to the API/UI.",
  },
  {
    stream: "DECISION_LOGGED",
    durableName: "journal",
    description: "Persists decisions to the journal.",
  },
  {
    stream: "SYSTEM_HEALTH",
    durableName: "health-monitor",
    description: "Aggregates service health.",
  },
];

/**
 * Validate and return the consumer specs. Throws if a consumer references an
 * unknown stream or two consumers on the same stream share a durable name —
 * both would make the topology unreproducible.
 */
export function buildConsumerSpecs(): ConsumerSpec[] {
  const streamNames = new Set(STREAMS.map((s) => s.name));
  const seen = new Set<string>();
  for (const c of CONSUMERS) {
    if (!streamNames.has(c.stream)) {
      throw new Error(`consumer '${c.durableName}' references unknown stream '${c.stream}'`);
    }
    const key = `${c.stream}/${c.durableName}`;
    if (seen.has(key)) {
      throw new Error(`duplicate durable consumer '${key}'`);
    }
    seen.add(key);
  }
  return CONSUMERS;
}
