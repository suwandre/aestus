import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemoryBus } from "@aestus/event-bus";
import {
  type Briefing,
  type ContextPacket,
  ContextPacket as ContextPacketSchema,
  CONTEXT_PACKET,
  PAYLOAD_TYPES,
  subject,
} from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { newMetrics } from "../src/health";
import { ModelRouting } from "../src/routing";
import { startLlmService } from "../src/service";
import { InMemoryBriefingStore } from "../src/store";
import { findExecutionLanguage, validateBriefing } from "../src/validate";
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

function baseBriefing(over: Partial<Briefing> = {}): Briefing {
  return {
    id: "b1",
    schema_version: 1,
    context_packet_id: "ctx-001",
    generated_at: "2026-06-07T12:00:00.000Z",
    stance: "long",
    thesis: "A pullback into the entry zone offers a favorable entry above the prior swing low.",
    factors: ["constructive trend"],
    invalidation_reasoning: "a close below the swing low negates the structure",
    confidence_reasoning: "strong context",
    recheck_condition: "if funding cools",
    entry_zone: { low: 67800, high: 68100 },
    invalidation: 66900,
    targets: [69500],
    size_suggestion: { risk_pct: 0.01 },
    timeframe: "swing",
    confidence: 0.6,
    model: "kimi-k2.6",
    supporting_context: ["ctx-001"],
    cost_metadata: {
      provider: "fake",
      model: "kimi-k2.6",
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      cost_usd: 0,
    },
    cache_hit: false,
    ...over,
  };
}

describe("P13-T008 briefing validation", () => {
  test("a clean directional briefing passes", () => {
    expect(validateBriefing(baseBriefing()).ok).toBe(true);
  });

  test("analytical language is not flagged as execution language", () => {
    expect(
      findExecutionLanguage(
        "A favorable entry near the zone; invalidation below 66900; first target 69500; the market structure is constructive.",
      ),
    ).toEqual([]);
  });

  test("flags forbidden execution language", () => {
    const v = validateBriefing(baseBriefing({ thesis: "Buy now and place an order at market." }));
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.includes("execution language"))).toBe(true);
  });

  test("directional briefing without invalidation fails", () => {
    const v = validateBriefing(baseBriefing({ invalidation: null }));
    expect(v.ok).toBe(false);
    expect(v.violations).toContain("directional briefing missing invalidation");
  });

  test("no_trade without levels is valid", () => {
    const v = validateBriefing(
      baseBriefing({ stance: "no_trade", entry_zone: null, invalidation: null, targets: [] }),
    );
    expect(v.ok).toBe(true);
  });

  test("confidence out of range fails", () => {
    expect(validateBriefing(baseBriefing({ confidence: 1.5 })).ok).toBe(false);
    expect(validateBriefing(baseBriefing({ confidence: -0.2 })).ok).toBe(false);
  });

  test("empty thesis fails", () => {
    expect(validateBriefing(baseBriefing({ thesis: "   " })).ok).toBe(false);
  });

  test("an invalid briefing is dropped — not stored, not notified", async () => {
    // A provider that slips into execution language.
    class ExecLangProvider implements LlmProvider {
      readonly name = "execlang";
      async complete(req: LlmCompletionRequest): Promise<LlmCompletion> {
        const content = JSON.stringify({
          stance: "long",
          thesis: "Buy now and place a market order immediately.",
          factors: [],
          confidence: 0.6,
          timeframe: "swing",
        });
        return {
          provider: this.name,
          model: req.model,
          content,
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          cost_usd: 0,
        };
      }
    }

    const bus = new InMemoryBus();
    const store = new InMemoryBriefingStore();
    const metrics = newMetrics();
    await startLlmService({
      bus,
      config: loadConfig(),
      metrics,
      provider: new ExecLangProvider(),
      store,
      routing: ModelRouting.fromDefaults(),
      now: () => new Date("2026-06-07T12:00:00Z"),
    });

    const packet = loadPacket();
    await bus.publish(subject(CONTEXT_PACKET, packet.primary_asset), packet, ContextPacketSchema, {
      source: "context",
      payload_type: PAYLOAD_TYPES.ContextPacket,
    });

    expect(metrics.rejected).toBe(1);
    expect(metrics.briefingsGenerated).toBe(0);
    expect(store.size()).toBe(0);
    await bus.close();
  });
});
