import { describe, expect, test } from "bun:test";
import { InMemoryBus } from "@aestus/event-bus";
import {
  type AnomalyEvent,
  type ContextPacket,
  type EventEnvelope,
  ANOMALY_DETECTED,
  AnomalyEvent as AnomalyEventSchema,
  CONTEXT_PACKET,
  ContextPacket as ContextPacketSchema,
  PAYLOAD_TYPES,
  subject,
} from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { newMetrics } from "../src/health";
import { startContextService } from "../src/service";
import { InMemoryPacketStore } from "../src/store";

const config = loadConfig();
const ds = new FixtureDataSource(config);

const trigger: AnomalyEvent = {
  id: "anom-001",
  type: "funding_spike",
  severity: "high",
  sigma: 2.6,
  assets: ["crypto:btc-usdt"],
  venues: ["binance"],
  title: "BTC funding rate spike",
  description: "Funding z-score reached 2.6.",
  detected_at: "2026-06-07T12:00:00.000Z",
  status: "active",
  context_refs: [],
};

describe("P11-T011 publish context packet event", () => {
  test("emits a context.packet.<asset> event LLM orchestration can consume", async () => {
    const bus = new InMemoryBus();
    const metrics = newMetrics();
    const store = new InMemoryPacketStore();

    // Stand in for the LLM orchestration consumer: subscribe to the exact
    // per-asset subject and capture both payload and envelope.
    const received: { packet: ContextPacket; envelope: EventEnvelope }[] = [];
    await bus.subscribe(
      subject(CONTEXT_PACKET, trigger.assets[0]!),
      ContextPacketSchema,
      (packet, envelope) => {
        received.push({ packet, envelope });
      },
    );

    await startContextService({
      bus,
      config,
      metrics,
      dataSource: ds,
      store,
      now: () => new Date("2026-06-07T12:00:05Z"),
    });

    // Publishing the anomaly drives the async assemble → persist → publish chain.
    await bus.publish(
      subject(ANOMALY_DETECTED, trigger.type, trigger.assets[0]!),
      trigger,
      AnomalyEventSchema,
      { source: "anomaly", payload_type: PAYLOAD_TYPES.AnomalyEvent, trace_id: "trace-xyz" },
    );

    expect(received.length).toBe(1);
    const { packet, envelope } = received[0]!;

    // Envelope carries the right contract type and propagates the trigger's trace.
    expect(envelope.payload_type).toBe(PAYLOAD_TYPES.ContextPacket);
    expect(envelope.trace_id).toBe("trace-xyz");
    expect(envelope.source).toBe(config.service);

    // The emitted packet is the fully-assembled one (real BTC snapshot, not the
    // neutral placeholder), with freshness info — not a T001-style placeholder.
    expect(packet.primary_asset).toBe("crypto:btc-usdt");
    expect(packet.market_snapshot.regime.trend).toBe("trending_up");
    expect(packet.source_freshness.length).toBeGreaterThan(0);

    // Published only after successful assembly; counters reflect both stages.
    expect(metrics.packetsBuilt).toBe(1);
    expect(metrics.packetsPublished).toBe(1);

    await bus.close();
  });

  test("does not publish (or count) when assembly fails", async () => {
    const bus = new InMemoryBus();
    const metrics = newMetrics();
    const published: unknown[] = [];
    await bus.subscribe(`${CONTEXT_PACKET.base}.>`, ContextPacketSchema, (p) => {
      published.push(p);
    });

    await startContextService({
      bus,
      config,
      metrics,
      assemble: () => {
        throw new Error("assembly boom");
      },
    });

    await bus.publish(
      subject(ANOMALY_DETECTED, trigger.type, trigger.assets[0]!),
      trigger,
      AnomalyEventSchema,
      { source: "anomaly", payload_type: PAYLOAD_TYPES.AnomalyEvent },
    );

    expect(published.length).toBe(0);
    expect(metrics.packetsBuilt).toBe(0);
    expect(metrics.packetsPublished).toBe(0);
    expect(metrics.errors).toBe(1);
    await bus.close();
  });
});
