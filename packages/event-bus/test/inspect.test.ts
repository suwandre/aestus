import { describe, expect, test } from "bun:test";
import { PAYLOAD_TYPES, RawMarketEvent, SCHEMA_VERSION } from "@aestus/contracts";
import { decodeEnvelopeBytes, encodeEvent, formatDecoded, formatEnvelope } from "../src/index";

const encoder = new TextEncoder();

const rawPayload = {
  schema_version: SCHEMA_VERSION,
  source: "binance:ws:perp@btcusdt",
  venue: "binance",
  received_at: "2026-06-08T12:00:00.000Z",
  sequence: 5,
  event_type: "aggTrade",
  raw_payload_hash: "zz",
};

describe("event inspection", () => {
  test("decodes a valid envelope and formats header + payload", () => {
    const { bytes } = encodeEvent(rawPayload, RawMarketEvent, {
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
      event_id: "evt-1",
      trace_id: "trace-1",
      emitted_at: "2026-06-08T00:00:00.000Z",
    });
    const decoded = decodeEnvelopeBytes(bytes);
    expect(decoded.ok).toBe(true);
    const text = formatDecoded("raw.market.binance", decoded);
    expect(text).toContain("raw.market.binance");
    expect(text).toContain("ingestion → RawMarketEvent");
    expect(text).toContain("evt-1");
    expect(text).toContain("trace=trace-1");
    // Payload is pretty-printed and indented.
    expect(text).toContain('"sequence": 5');
  });

  test("undecodable bytes are flagged, not thrown", () => {
    const decoded = decodeEnvelopeBytes(encoder.encode("not json"));
    expect(decoded.ok).toBe(false);
    const text = formatDecoded("x.y", decoded);
    expect(text).toContain("UNDECODABLE ENVELOPE");
    expect(text).toContain("not json");
  });

  test("formatEnvelope renders schema version and trace", () => {
    const text = formatEnvelope("s.subj", {
      event_id: "e",
      schema_version: SCHEMA_VERSION,
      trace_id: "t",
      source: "svc",
      emitted_at: "2026-06-08T00:00:00.000Z",
      payload_type: "Thing",
      payload: { a: 1 },
    });
    expect(text).toContain(`v${SCHEMA_VERSION}`);
    expect(text).toContain("svc → Thing");
  });
});
