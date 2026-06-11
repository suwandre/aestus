import { describe, expect, test } from "bun:test";
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
import { FakeLlmProvider } from "../src/provider";
import { ModelRouting } from "../src/routing";
import { startLlmService } from "../src/service";
import { InMemoryBriefingStore } from "../src/store";
import { validateBriefing } from "../src/validate";

function loadPacket(): ContextPacket {
  const raw = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../fixtures/context/packets.json", import.meta.url)),
      "utf8",
    ),
  );
  return ContextPacketSchema.parse(Array.isArray(raw) ? raw[0] : raw);
}

const REASONS = ["high-importance CPI in three days", "volatility already elevated"];
const RECHECK = ["after the CPI print clears"];

function noTradePacket(): ContextPacket {
  const p = structuredClone(loadPacket());
  p.deterministic_levels.no_trade = { is_no_trade: true, reasons: REASONS, recheck: RECHECK };
  return p;
}

const fixedNow = () => new Date("2026-06-07T12:00:00Z");

describe("P13-T009 no-trade briefing path", () => {
  test("no_trade briefing carries reasons + re-check, no entry/targets required", async () => {
    const briefing = await generateBriefing(noTradePacket(), {
      provider: new FakeLlmProvider(),
      model: "kimi-k2.6",
      now: fixedNow,
      newId: () => "nt1",
    });
    expect(briefing.stance).toBe("no_trade");
    expect(briefing.entry_zone).toBeNull();
    expect(briefing.invalidation).toBeNull();
    expect(briefing.targets).toEqual([]);
    expect(briefing.size_suggestion).toBeNull();
    // Reasons are captured (in factors) and re-check conditions are present.
    expect(briefing.factors).toEqual(expect.arrayContaining(REASONS));
    expect(briefing.recheck_condition).toContain(RECHECK[0]!);
    // It is a valid, complete briefing — no_trade does not need an invalidation.
    expect(() => Briefing.parse(briefing)).not.toThrow();
    expect(validateBriefing(briefing).ok).toBe(true);
  });

  test("prompt surfaces the no-trade contract and the engine's reasons/recheck", () => {
    const user = buildBriefingMessages(noTradePacket()).find((m) => m.role === "user")!.content;
    expect(user).toContain("No-trade path");
    expect(user).toContain("Entry, invalidation, and targets are NOT required");
    expect(user).toContain("Engine reasons");
    expect(user).toContain(REASONS[0]!);
    expect(user).toContain(RECHECK[0]!);
  });

  test("no_trade output is stored as a first-class briefing", async () => {
    const bus = new InMemoryBus();
    const store = new InMemoryBriefingStore();
    const metrics = newMetrics();
    await startLlmService({
      bus,
      config: loadConfig(),
      metrics,
      provider: new FakeLlmProvider(),
      store,
      routing: ModelRouting.fromDefaults(),
      now: fixedNow,
    });

    const packet = noTradePacket();
    await bus.publish(subject(CONTEXT_PACKET, packet.primary_asset), packet, ContextPacketSchema, {
      source: "context",
      payload_type: PAYLOAD_TYPES.ContextPacket,
    });

    const stored = await store.byPacket(packet.id);
    expect(stored.length).toBe(1);
    expect(stored[0]!.stance).toBe("no_trade");
    expect(metrics.briefingsGenerated).toBe(1);
    expect(metrics.rejected).toBe(0);
    await bus.close();
  });
});
