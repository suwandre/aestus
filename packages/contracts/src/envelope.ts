import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp, SCHEMA_VERSION } from "./common";

/**
 * Transport envelope wrapping every event published to the NATS backbone
 * (P05-T002). Producers never publish a bare payload — they wrap it so that
 * consumers, the replay utility, and the inspection CLI all see the same
 * metadata regardless of which stream/subject the event arrived on.
 *
 * Mirrored in Rust at `crates/event_model/src/envelope.rs`.
 *
 * - `event_id`    — unique id for this event (dedup, idempotency).
 * - `schema_version` — wire-format version of the envelope (`SCHEMA_VERSION`).
 * - `trace_id`    — correlates events across the pipeline; defaults to `event_id`
 *                   at the origin and is propagated by downstream producers.
 * - `source`      — logical producer id, e.g. `ingestion`, `features`.
 * - `emitted_at`  — when the producer emitted the envelope (server clock).
 * - `payload_type`— canonical name of the payload contract (see {@link PAYLOAD_TYPES}).
 * - `payload`     — the contract instance; typed via {@link envelopeOf}.
 */
export const EventEnvelope = z.object({
  event_id: Id,
  schema_version: SchemaVersion,
  trace_id: Id,
  source: Id,
  emitted_at: Timestamp,
  payload_type: z.string().min(1),
  payload: z.unknown(),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

/**
 * Canonical payload-type names. Open by design (DLQ and future events add
 * their own), but these are the names the stream topology expects.
 */
export const PAYLOAD_TYPES = {
  RawMarketEvent: "RawMarketEvent",
  NormalizedMarketEvent: "NormalizedMarketEvent",
  FeatureSnapshot: "FeatureSnapshot",
  AnomalyEvent: "AnomalyEvent",
  ContextPacket: "ContextPacket",
  Briefing: "Briefing",
  Decision: "Decision",
  SystemHealth: "SystemHealth",
} as const;
export type PayloadType = (typeof PAYLOAD_TYPES)[keyof typeof PAYLOAD_TYPES];

/**
 * Build an envelope schema with a typed `payload`. Use this to validate that an
 * envelope both has the right metadata and carries the expected contract:
 *
 * ```ts
 * const RawEnvelope = envelopeOf(RawMarketEvent);
 * RawEnvelope.parse(incoming); // payload is RawMarketEvent
 * ```
 */
export function envelopeOf<T extends z.ZodTypeAny>(payload: T) {
  return EventEnvelope.extend({ payload });
}

/** Fields a caller supplies to {@link makeEnvelope}; the rest are filled in. */
export interface MakeEnvelopeInput<T> {
  source: string;
  payload_type: string;
  payload: T;
  /** Defaults to a fresh `event_id` (origin of a new trace). */
  trace_id?: string;
  /** Defaults to a generated UUID. Inject for deterministic fixtures/tests. */
  event_id?: string;
  /** Defaults to the current time. Inject for deterministic fixtures/tests. */
  emitted_at?: string;
}

/**
 * Construct a well-formed envelope, filling `event_id`, `emitted_at`,
 * `schema_version`, and defaulting `trace_id` to `event_id` when omitted.
 * Ids/timestamps are injectable so fixtures and tests stay deterministic.
 */
export function makeEnvelope<T>(input: MakeEnvelopeInput<T>): EventEnvelope & { payload: T } {
  const event_id = input.event_id ?? crypto.randomUUID();
  return {
    event_id,
    schema_version: SCHEMA_VERSION,
    trace_id: input.trace_id ?? event_id,
    source: input.source,
    emitted_at: input.emitted_at ?? new Date().toISOString(),
    payload_type: input.payload_type,
    payload: input.payload,
  };
}
