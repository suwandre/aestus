import { describe, expect, test } from "bun:test";

import {
  EventEnvelope,
  envelopeOf,
  makeEnvelope,
  PAYLOAD_TYPES,
  RawMarketEvent,
  SCHEMA_VERSION,
} from "../src/index";

const sampleRaw = {
  schema_version: SCHEMA_VERSION,
  source: "binance:ws:perp@btcusdt",
  venue: "binance",
  received_at: "2026-06-08T12:00:00.000Z",
  sequence: 42,
  event_type: "aggTrade",
  raw_payload_hash: "deadbeef",
};

describe("event envelope", () => {
  test("makeEnvelope fills metadata and defaults trace_id to event_id", () => {
    const env = makeEnvelope({
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
      payload: sampleRaw,
    });
    expect(env.schema_version).toBe(SCHEMA_VERSION);
    expect(env.event_id.length).toBeGreaterThan(0);
    expect(env.trace_id).toBe(env.event_id);
    expect(typeof env.emitted_at).toBe("string");
    EventEnvelope.parse(env);
  });

  test("injected ids/timestamps are honored (deterministic fixtures)", () => {
    const env = makeEnvelope({
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
      payload: sampleRaw,
      event_id: "evt-1",
      trace_id: "trace-1",
      emitted_at: "2026-06-08T00:00:00.000Z",
    });
    expect(env).toEqual({
      event_id: "evt-1",
      schema_version: SCHEMA_VERSION,
      trace_id: "trace-1",
      source: "ingestion",
      emitted_at: "2026-06-08T00:00:00.000Z",
      payload_type: "RawMarketEvent",
      payload: sampleRaw,
    });
  });

  test("envelopeOf validates the typed payload", () => {
    const RawEnvelope = envelopeOf(RawMarketEvent);
    const env = makeEnvelope({
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
      payload: sampleRaw,
    });
    const parsed = RawEnvelope.parse(env);
    expect(parsed.payload.sequence).toBe(42);
    // A malformed payload is rejected by the typed envelope.
    expect(() => RawEnvelope.parse({ ...env, payload: { nope: true } })).toThrow();
  });

  test("envelope with missing metadata is rejected", () => {
    expect(() => EventEnvelope.parse({ source: "x" })).toThrow();
  });
});
