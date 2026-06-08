import { describe, expect, test } from "bun:test";
import { z } from "zod/v4";
import {
  DeadLetter,
  PAYLOAD_TYPES,
  RawMarketEvent,
  SCHEMA_VERSION,
  ContextPacket,
  deadLetterSubject,
} from "@aestus/contracts";
import { InMemoryBus, makeDeadLetterHandler } from "../src/index";

const rawPayload = {
  schema_version: SCHEMA_VERSION,
  source: "binance:ws:perp@btcusdt",
  venue: "binance",
  received_at: "2026-06-08T12:00:00.000Z",
  sequence: 7,
  event_type: "aggTrade",
  raw_payload_hash: "hh",
};

describe("dead-letter routing", () => {
  test("deadLetterSubject prefixes dlq.", () => {
    expect(deadLetterSubject("raw.market.binance")).toBe("dlq.raw.market.binance");
  });

  test("a poison message is routed to the DLQ with original event + error metadata", async () => {
    const bus = new InMemoryBus();
    const dead: DeadLetter[] = [];

    // DLQ monitor listens to the whole dead-letter namespace.
    await bus.subscribe("dlq.>", DeadLetter, (record) => {
      dead.push(record);
    });

    // Consumer expects a ContextPacket but receives a RawMarketEvent → poison.
    await bus.subscribe(
      "raw.market.binance",
      ContextPacket as unknown as z.ZodType<unknown>,
      () => {
        throw new Error("handler must not run on poison");
      },
      {
        onError: makeDeadLetterHandler(bus, {
          consumer: "normalizer",
          now: () => "2026-06-08T00:00:00.000Z",
        }),
      },
    );

    await bus.publish("raw.market.binance", rawPayload, RawMarketEvent, {
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
    });
    // Let the fire-and-forget DLQ publish settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(dead.length).toBe(1);
    const record = dead[0]!;
    expect(record.original_subject).toBe("raw.market.binance");
    expect(record.consumer).toBe("normalizer");
    expect(record.error_type).toBe("ContractValidationError");
    expect(record.failed_at).toBe("2026-06-08T00:00:00.000Z");
    // Original event is preserved verbatim and is itself a decodable envelope.
    const original = JSON.parse(record.original_event);
    expect(original.payload_type).toBe("RawMarketEvent");
    expect(original.payload.sequence).toBe(7);

    await bus.close();
  });
});
