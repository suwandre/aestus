import { z } from "zod/v4";
import {
  AnomalyEvent,
  ANOMALY_DETECTED,
  FeatureSnapshot,
  FEATURE_SNAPSHOT,
  NormalizedMarketEvent,
  NORMALIZED_MARKET,
  PAYLOAD_TYPES,
  RawMarketEvent,
  RAW_MARKET,
  subject,
  type StreamDefinition,
} from "@aestus/contracts";
import type { EventBus } from "./types";

/**
 * Event-replay core (P05-T007). Reads contract payloads (from fixtures or any
 * loader) and republishes them into NATS as envelopes, so the feature and
 * anomaly engines can be exercised against deterministic, repeatable event
 * streams. Envelope ids/timestamps are derived from the source + index, so the
 * same input always produces the same stream.
 */

/** Fallback emitted_at when a payload has no timestamp field. */
export const REPLAY_EPOCH = "2026-01-01T00:00:00.000Z";

/** One payload prepared for publishing. */
export interface PreparedEvent {
  subject: string;
  payloadType: string;
  /** Publish this event onto a bus (validates against its contract). */
  publish(bus: EventBus): Promise<void>;
}

/** A replayable fixture source: a file of contract payloads + how to route them. */
export interface ReplaySource {
  key: string;
  /** Path relative to the repo `fixtures/` directory. */
  file: string;
  /** Build deterministic prepared events from the raw fixture items. */
  build(items: unknown[]): PreparedEvent[];
}

function defineSource<T>(
  key: string,
  file: string,
  schema: z.ZodType<T>,
  payloadType: string,
  stream: StreamDefinition,
  tokens: (payload: T) => string[],
  timeOf: (payload: T) => string | undefined,
): ReplaySource {
  return {
    key,
    file,
    build(items) {
      return items.map((raw, i): PreparedEvent => {
        const payload = schema.parse(raw);
        const id = `replay-${key}-${i}`;
        const subj = subject(stream, ...tokens(payload));
        return {
          subject: subj,
          payloadType,
          publish: (bus) =>
            bus.publish(subj, payload, schema, {
              source: "replay",
              payload_type: payloadType,
              event_id: id,
              trace_id: id,
              emitted_at: timeOf(payload) ?? REPLAY_EPOCH,
            }),
        };
      });
    },
  };
}

/**
 * The replayable sources. Covers the pipeline chains the engines depend on:
 * raw → normalized (feature-engine input) and feature → anomaly.
 */
export const REPLAY_SOURCES: readonly ReplaySource[] = [
  defineSource(
    "raw",
    "market/raw_events.json",
    RawMarketEvent,
    PAYLOAD_TYPES.RawMarketEvent,
    RAW_MARKET,
    (p) => [p.venue],
    (p) => p.received_at,
  ),
  defineSource(
    "normalized",
    "market/normalized_events.json",
    NormalizedMarketEvent,
    PAYLOAD_TYPES.NormalizedMarketEvent,
    NORMALIZED_MARKET,
    (p) => [p.canonical_asset_id, p.event_type],
    (p) => p.timestamp,
  ),
  defineSource(
    "features",
    "features/snapshots.json",
    FeatureSnapshot,
    PAYLOAD_TYPES.FeatureSnapshot,
    FEATURE_SNAPSHOT,
    (p) => [p.canonical_asset_id],
    (p) => p.timestamp,
  ),
  defineSource(
    "anomalies",
    "anomalies/events.json",
    AnomalyEvent,
    PAYLOAD_TYPES.AnomalyEvent,
    ANOMALY_DETECTED,
    (p) => [p.assets[0] ?? "unknown", p.type],
    (p) => p.detected_at,
  ),
];

/** Resolve a source by key (or `undefined`). */
export function replaySource(key: string): ReplaySource | undefined {
  return REPLAY_SOURCES.find((s) => s.key === key);
}

/** Publish prepared events onto a bus in order. */
export async function replay(bus: EventBus, events: PreparedEvent[]): Promise<void> {
  for (const event of events) await event.publish(bus);
}
