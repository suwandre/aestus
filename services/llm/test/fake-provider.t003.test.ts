import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemoryBus } from "@aestus/event-bus";
import {
  type ContextPacket,
  ContextPacket as ContextPacketSchema,
  Briefing,
  CONTEXT_PACKET,
  PAYLOAD_TYPES,
  subject,
} from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { generateBriefing } from "../src/generate";
import { newMetrics } from "../src/health";
import { buildBriefingMessages } from "../src/prompt";
import { createProvider, FakeLlmProvider } from "../src/provider";
import { startLlmService } from "../src/service";
import { InMemoryBriefingStore } from "../src/store";

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

describe("P13-T003 fake/local provider", () => {
  test("is deterministic — same prompt yields byte-identical output", async () => {
    const provider = new FakeLlmProvider();
    const messages = buildBriefingMessages(loadPacket());
    const a = await provider.complete({ model: "kimi-k2.6", messages, temperature: 0 });
    const b = await provider.complete({ model: "kimi-k2.6", messages, temperature: 0 });
    expect(a.content).toBe(b.content);
    expect(a.usage).toEqual(b.usage);
  });

  test("produces a packet-consistent stance for long / short / no_trade", async () => {
    const base = loadPacket();

    const longBrief = await generateBriefing(base, {
      provider: new FakeLlmProvider(),
      model: "kimi-k2.6",
      now: fixedNow,
      newId: () => "b-long",
    });
    expect(longBrief.stance).toBe("long");
    expect(longBrief.entry_zone).toEqual(base.deterministic_levels.entry_zone);

    const shortPacket = structuredClone(base);
    shortPacket.deterministic_levels.direction = "short";
    const shortBrief = await generateBriefing(shortPacket, {
      provider: new FakeLlmProvider(),
      model: "kimi-k2.6",
      now: fixedNow,
      newId: () => "b-short",
    });
    expect(shortBrief.stance).toBe("short");
    expect(shortBrief.invalidation).toBe(base.deterministic_levels.invalidation);

    const noTradePacket = structuredClone(base);
    noTradePacket.deterministic_levels.no_trade = {
      is_no_trade: true,
      reasons: ["high-importance macro imminent"],
      recheck: ["after the print clears"],
    };
    const noTradeBrief = await generateBriefing(noTradePacket, {
      provider: new FakeLlmProvider(),
      model: "kimi-k2.6",
      now: fixedNow,
      newId: () => "b-nt",
    });
    expect(noTradeBrief.stance).toBe("no_trade");
    expect(noTradeBrief.entry_zone).toBeNull();
    expect(noTradeBrief.invalidation).toBeNull();
    expect(noTradeBrief.targets).toEqual([]);
    expect(noTradeBrief.size_suggestion).toBeNull();
    // All three are valid Briefings regardless of stance.
    for (const b of [longBrief, shortBrief, noTradeBrief]) {
      expect(() => Briefing.parse(b)).not.toThrow();
    }
  });
});

describe("P13-T003 pipeline runs with no secrets", () => {
  const saved: Record<string, string | undefined> = {};
  const SECRETS = ["OLLAMA_API_KEY", "NATS_URL", "DATABASE_URL"];

  beforeEach(() => {
    for (const k of SECRETS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of SECRETS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("createProvider falls back to the fake and the full pipeline produces a briefing", async () => {
    const config = loadConfig();
    expect(config.ollamaApiKey).toBeUndefined();
    const provider = createProvider(config);
    expect(provider).toBeInstanceOf(FakeLlmProvider);

    const bus = new InMemoryBus();
    const store = new InMemoryBriefingStore();
    await startLlmService({
      bus,
      config,
      metrics: newMetrics(),
      provider,
      store,
      model: "kimi-k2.6",
      now: fixedNow,
    });

    const packet = loadPacket();
    await bus.publish(subject(CONTEXT_PACKET, packet.primary_asset), packet, ContextPacketSchema, {
      source: "context",
      payload_type: PAYLOAD_TYPES.ContextPacket,
    });

    const stored = await store.byPacket(packet.id);
    expect(stored.length).toBe(1);
    expect(() => Briefing.parse(stored[0])).not.toThrow();
    await bus.close();
  });
});
