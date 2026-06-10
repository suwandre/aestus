import { describe, expect, test } from "bun:test";
import { InMemoryBus, startHeartbeat } from "@aestus/event-bus";
import {
  ANOMALY_DETECTED,
  type AnomalyEvent,
  AnomalyEvent as AnomalyEventSchema,
  CONTEXT_PACKET,
  ContextPacket as ContextPacketSchema,
  PAYLOAD_TYPES,
  SystemHealth as SystemHealthSchema,
  SYSTEM_HEALTH,
  subject,
} from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { newMetrics } from "../src/health";
import { startContextService } from "../src/service";

const trigger: AnomalyEvent = {
  id: "anom-001",
  type: "funding_spike" as const,
  severity: "high" as const,
  sigma: 2.6,
  assets: ["crypto:btc-usdt"],
  venues: ["binance"],
  title: "BTC funding rate spike",
  description: "Funding z-score reached 2.6.",
  detected_at: "2026-06-07T12:00:00.000Z",
  status: "active" as const,
  context_refs: [],
};

describe("P11-T001 skeleton", () => {
  test("emits a placeholder context.packet for an anomaly", async () => {
    const bus = new InMemoryBus();
    const config = loadConfig();
    const metrics = newMetrics();

    const received: unknown[] = [];
    await bus.subscribe(`${CONTEXT_PACKET.base}.>`, ContextPacketSchema, (p) => {
      received.push(p);
    });
    await startContextService({
      bus,
      config,
      metrics,
      now: () => new Date("2026-06-07T12:00:05Z"),
    });

    await bus.publish(
      subject(ANOMALY_DETECTED, trigger.type, trigger.assets[0]!),
      trigger,
      AnomalyEventSchema,
      {
        source: "anomaly",
        payload_type: PAYLOAD_TYPES.AnomalyEvent,
      },
    );

    expect(received.length).toBe(1);
    const packet = ContextPacketSchema.parse(received[0]);
    expect(packet.primary_asset).toBe("crypto:btc-usdt");
    expect(packet.trigger.id).toBe("anom-001");
    expect(metrics.packetsBuilt).toBe(1);
    await bus.close();
  });

  test("emits a heartbeat", async () => {
    const bus = new InMemoryBus();
    const beats: unknown[] = [];
    await bus.subscribe(`${SYSTEM_HEALTH.base}.>`, SystemHealthSchema, (h) => {
      beats.push(h);
    });
    const hb = startHeartbeat(bus, { service: "context", version: "0.1.0", intervalMs: 60_000 });
    await new Promise((r) => setTimeout(r, 10));
    await hb.unsubscribe();
    expect(beats.length).toBeGreaterThanOrEqual(1);
    await bus.close();
  });
});
