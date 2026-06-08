import { describe, expect, test } from "bun:test";
import { z } from "zod/v4";
import {
  ContextPacket,
  PAYLOAD_TYPES,
  RawMarketEvent,
  SCHEMA_VERSION,
  subject,
  RAW_MARKET,
} from "@aestus/contracts";
import { ContractValidationError, InMemoryBus, subjectMatches } from "../src/index";

const rawPayload = {
  schema_version: SCHEMA_VERSION,
  source: "binance:ws:perp@btcusdt",
  venue: "binance",
  received_at: "2026-06-08T12:00:00.000Z",
  sequence: 1,
  event_type: "aggTrade",
  raw_payload_hash: "abc123",
};

describe("subject matching", () => {
  test("literal, single-token, and tail wildcards", () => {
    expect(subjectMatches("raw.market.binance", "raw.market.binance")).toBe(true);
    expect(subjectMatches("raw.market.*", "raw.market.binance")).toBe(true);
    expect(subjectMatches("raw.market.*", "raw.market.binance.btc")).toBe(false);
    expect(subjectMatches("raw.market.>", "raw.market.binance.btc")).toBe(true);
    expect(subjectMatches("raw.market.>", "raw.market")).toBe(false);
    expect(subjectMatches("normalized.market", "raw.market")).toBe(false);
  });
});

describe("in-memory event bus", () => {
  test("publish → subscribe round-trip delivers a validated payload + envelope", async () => {
    const bus = new InMemoryBus();
    const received: { seq: number; source: string }[] = [];
    await bus.subscribe(subject(RAW_MARKET, "binance", "btc-usdt"), RawMarketEvent, (p, env) => {
      received.push({ seq: p.sequence, source: env.source });
    });
    await bus.publish(subject(RAW_MARKET, "binance", "btc-usdt"), rawPayload, RawMarketEvent, {
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
    });
    expect(received).toEqual([{ seq: 1, source: "ingestion" }]);
    await bus.close();
  });

  test("wildcard subscription receives matching subjects", async () => {
    const bus = new InMemoryBus();
    let count = 0;
    await bus.subscribe("raw.market.>", RawMarketEvent, () => {
      count += 1;
    });
    await bus.publish("raw.market.binance.btc", rawPayload, RawMarketEvent, {
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
    });
    await bus.publish("raw.market.bybit.eth", rawPayload, RawMarketEvent, {
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
    });
    expect(count).toBe(2);
  });

  test("publishing an invalid payload throws before it hits the wire", async () => {
    const bus = new InMemoryBus();
    await expect(
      bus.publish(
        "raw.market.binance",
        { nope: true } as unknown as typeof rawPayload,
        RawMarketEvent,
        { source: "ingestion", payload_type: PAYLOAD_TYPES.RawMarketEvent },
      ),
    ).rejects.toThrow();
    await bus.close();
  });

  test("a poison message surfaces via onError, not the publisher", async () => {
    const bus = new InMemoryBus();
    const errors: unknown[] = [];
    // Subscriber expects a ContextPacket but we publish a RawMarketEvent on the
    // same subject — the envelope decodes, the payload fails validation.
    await bus.subscribe(
      "raw.market.binance",
      ContextPacket as unknown as z.ZodType<unknown>,
      () => {
        throw new Error("handler should not run");
      },
      {
        onError: (e) => errors.push(e),
      },
    );
    await bus.publish("raw.market.binance", rawPayload, RawMarketEvent, {
      source: "ingestion",
      payload_type: PAYLOAD_TYPES.RawMarketEvent,
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(ContractValidationError);
    await bus.close();
  });

  test("request → respond round-trips with validation both ways", async () => {
    const bus = new InMemoryBus();
    const Req = z.object({ ping: z.string() });
    const Res = z.object({ pong: z.string() });
    await bus.respond("rpc.echo", Req, Res, (req) => ({ pong: req.ping.toUpperCase() }), {
      source: "responder",
      payload_type: "Echo",
    });
    const { payload, envelope } = await bus.request("rpc.echo", { ping: "hi" }, Req, Res, {
      source: "requester",
      payload_type: "Echo",
    });
    expect(payload.pong).toBe("HI");
    expect(envelope.source).toBe("responder");
    await bus.close();
  });
});
