import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemoryBus, startHeartbeat } from "@aestus/event-bus";
import {
  type ContextPacket,
  ContextPacket as ContextPacketSchema,
  CONTEXT_PACKET,
  PAYLOAD_TYPES,
  SystemHealth as SystemHealthSchema,
  SYSTEM_HEALTH,
  subject,
} from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { newMetrics } from "../src/health";
import { FakeLlmProvider } from "../src/provider/fake";
import { startLlmService } from "../src/service";
import { InMemoryBriefingStore } from "../src/store";

/** The repo's context-packet fixture, parsed through the contract (fills defaults). */
function loadPacket(): ContextPacket {
  const raw = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../fixtures/context/packets.json", import.meta.url)),
      "utf8",
    ),
  );
  return ContextPacketSchema.parse(Array.isArray(raw) ? raw[0] : raw);
}

describe("P13-T001 skeleton", () => {
  test("processes a context packet job and stores a fake briefing", async () => {
    const bus = new InMemoryBus();
    const config = loadConfig();
    const metrics = newMetrics();
    const store = new InMemoryBriefingStore();
    const provider = new FakeLlmProvider();

    await startLlmService({
      bus,
      config,
      metrics,
      provider,
      store,
      model: "kimi-k2.6",
      now: () => new Date("2026-06-07T12:00:08Z"),
    });

    const packet = loadPacket();
    await bus.publish(subject(CONTEXT_PACKET, packet.primary_asset), packet, ContextPacketSchema, {
      source: "context",
      payload_type: PAYLOAD_TYPES.ContextPacket,
    });

    expect(metrics.briefingsGenerated).toBe(1);
    expect(metrics.llmCalls).toBe(1);
    expect(metrics.promptTokens).toBeGreaterThan(0);
    expect(metrics.completionTokens).toBeGreaterThan(0);

    const stored = await store.byPacket(packet.id);
    expect(stored.length).toBe(1);
    const briefing = stored[0]!;
    expect(["long", "short", "no_trade"]).toContain(briefing.stance);
    expect(briefing.thesis.length).toBeGreaterThan(0);
    expect(briefing.context_packet_id).toBe(packet.id);
    expect(briefing.cost_metadata.provider).toBe("fake");
    expect(briefing.cost_metadata.total_tokens).toBeGreaterThan(0);

    // Deterministic levels are copied from the packet (hard rule #2), not invented.
    if (briefing.stance === "long" || briefing.stance === "short") {
      expect(briefing.entry_zone).toEqual(packet.deterministic_levels.entry_zone);
      expect(briefing.invalidation).toBe(packet.deterministic_levels.invalidation);
      expect(briefing.targets).toEqual(packet.deterministic_levels.targets);
    } else {
      expect(briefing.entry_zone).toBeNull();
      expect(briefing.invalidation).toBeNull();
    }

    await bus.close();
  });

  test("emits a heartbeat", async () => {
    const bus = new InMemoryBus();
    const beats: unknown[] = [];
    await bus.subscribe(`${SYSTEM_HEALTH.base}.>`, SystemHealthSchema, (h) => {
      beats.push(h);
    });
    const hb = startHeartbeat(bus, { service: "llm", version: "0.1.0", intervalMs: 60_000 });
    await new Promise((r) => setTimeout(r, 10));
    await hb.unsubscribe();
    expect(beats.length).toBeGreaterThanOrEqual(1);
    await bus.close();
  });
});
