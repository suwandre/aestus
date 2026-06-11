import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemoryBus } from "@aestus/event-bus";
import {
  type Briefing,
  type ContextPacket,
  ContextPacket as ContextPacketSchema,
  Briefing as BriefingSchema,
  BRIEFING_GENERATED,
  CONTEXT_PACKET,
  type EventEnvelope,
  PAYLOAD_TYPES,
  subject,
} from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { newMetrics } from "../src/health";
import { FakeLlmProvider } from "../src/provider";
import { ModelRouting } from "../src/routing";
import { startLlmService } from "../src/service";
import { InMemoryBriefingStore } from "../src/store";
import type { LlmCompletion, LlmCompletionRequest, LlmProvider } from "../src/provider";

function loadPacket(): ContextPacket {
  const raw = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../fixtures/context/packets.json", import.meta.url)),
      "utf8",
    ),
  );
  return ContextPacketSchema.parse(Array.isArray(raw) ? raw[0] : raw);
}

const fixedNow = () => new Date("2026-06-07T12:00:00Z");

describe("P13-T011 publish briefing.generated", () => {
  test("a generated briefing is published for realtime consumers", async () => {
    const bus = new InMemoryBus();
    const metrics = newMetrics();
    const received: Array<{ payload: Briefing; envelope: EventEnvelope }> = [];
    await bus.subscribe(`${BRIEFING_GENERATED.base}.>`, BriefingSchema, (payload, envelope) => {
      received.push({ payload, envelope });
    });

    await startLlmService({
      bus,
      config: loadConfig(),
      metrics,
      provider: new FakeLlmProvider(),
      store: new InMemoryBriefingStore(),
      routing: ModelRouting.fromDefaults(),
      now: fixedNow,
    });

    const packet = loadPacket();
    await bus.publish(subject(CONTEXT_PACKET, packet.primary_asset), packet, ContextPacketSchema, {
      source: "context",
      payload_type: PAYLOAD_TYPES.ContextPacket,
      trace_id: "trace-xyz",
    });

    expect(received.length).toBe(1);
    expect(metrics.briefingsPublished).toBe(1);
    const { payload, envelope } = received[0]!;
    expect(() => BriefingSchema.parse(payload)).not.toThrow();
    expect(payload.context_packet_id).toBe(packet.id);
    // Subject is briefing.generated.<asset>; trace id propagated from the packet.
    expect(envelope.payload_type).toBe(PAYLOAD_TYPES.Briefing);
    expect(envelope.trace_id).toBe("trace-xyz");
    await bus.close();
  });

  test("publishes under the asset-routed subject", () => {
    const packet = loadPacket();
    expect(subject(BRIEFING_GENERATED, packet.primary_asset)).toBe(
      "briefing.generated.crypto_btc_usdt",
    );
  });

  test("invalid briefings are not published", async () => {
    class ExecLangProvider implements LlmProvider {
      readonly name = "execlang";
      async complete(req: LlmCompletionRequest): Promise<LlmCompletion> {
        return {
          provider: this.name,
          model: req.model,
          content: JSON.stringify({
            stance: "long",
            thesis: "Buy now and place a market order.",
            confidence: 0.6,
            timeframe: "swing",
          }),
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          cost_usd: 0,
        };
      }
    }
    const bus = new InMemoryBus();
    const metrics = newMetrics();
    let count = 0;
    await bus.subscribe(`${BRIEFING_GENERATED.base}.>`, BriefingSchema, () => {
      count += 1;
    });
    await startLlmService({
      bus,
      config: loadConfig(),
      metrics,
      provider: new ExecLangProvider(),
      store: new InMemoryBriefingStore(),
      routing: ModelRouting.fromDefaults(),
      now: fixedNow,
    });
    const packet = loadPacket();
    await bus.publish(subject(CONTEXT_PACKET, packet.primary_asset), packet, ContextPacketSchema, {
      source: "context",
      payload_type: PAYLOAD_TYPES.ContextPacket,
    });
    expect(count).toBe(0);
    expect(metrics.briefingsPublished).toBe(0);
    await bus.close();
  });
});
