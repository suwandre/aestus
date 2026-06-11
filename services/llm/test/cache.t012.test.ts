import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InMemoryBus } from "@aestus/event-bus";
import { type ContextPacket, ContextPacket as ContextPacketSchema } from "@aestus/contracts";
import { BriefingCache, briefingSignature } from "../src/cache";
import { loadConfig } from "../src/config";
import { newMetrics } from "../src/health";
import { FakeLlmProvider } from "../src/provider";
import { ModelRouting } from "../src/routing";
import { type LlmServiceDeps, processPacket } from "../src/service";
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

const COOLDOWN_MS = 30 * 60_000;
const T0 = Date.parse("2026-06-07T12:00:00Z");

describe("P13-T012 briefing cache signature", () => {
  test("identical material context yields the same signature", () => {
    expect(briefingSignature(loadPacket())).toBe(briefingSignature(loadPacket()));
  });

  test("cosmetic changes do not bust the cache", () => {
    const p = loadPacket();
    const cosmetic = structuredClone(p);
    cosmetic.id = "ctx-999";
    cosmetic.generated_at = "2026-06-07T23:59:59.000Z";
    expect(briefingSignature(cosmetic)).toBe(briefingSignature(p));
  });

  test("a material level change busts the cache", () => {
    const p = loadPacket();
    const moved = structuredClone(p);
    moved.deterministic_levels.invalidation = 66000;
    expect(briefingSignature(moved)).not.toBe(briefingSignature(p));
  });

  test("shouldGenerate respects the cooldown", () => {
    const cache = new BriefingCache(COOLDOWN_MS);
    const sig = "sig";
    expect(cache.shouldGenerate(sig, T0)).toBe(true);
    cache.record(sig, T0);
    expect(cache.shouldGenerate(sig, T0 + 60_000)).toBe(false); // within cooldown
    expect(cache.shouldGenerate(sig, T0 + COOLDOWN_MS)).toBe(true); // cooldown elapsed
  });
});

describe("P13-T012 duplicate anomalies do not re-spend", () => {
  function makeDeps(cache: BriefingCache, now: () => Date): LlmServiceDeps {
    return {
      bus: new InMemoryBus(),
      config: loadConfig(),
      metrics: newMetrics(),
      provider: new FakeLlmProvider(),
      store: new InMemoryBriefingStore(),
      routing: ModelRouting.fromDefaults(),
      cache,
      now,
    };
  }

  test("a duplicate within cooldown is skipped; a material change or cooldown elapse regenerates", async () => {
    const cache = new BriefingCache(COOLDOWN_MS);
    let nowMs = T0;
    const deps = makeDeps(cache, () => new Date(nowMs));
    const store = deps.store as InMemoryBriefingStore;
    const packet = loadPacket();

    // 1) First occurrence → generates.
    const r1 = await processPacket(packet, deps);
    expect(r1.cached).toBe(false);
    expect(deps.metrics.llmCalls).toBe(1);
    expect(deps.metrics.cacheHits).toBe(0);
    expect(store.size()).toBe(1);

    // 2) Duplicate within cooldown → skipped, no LLM call.
    nowMs = T0 + 60_000;
    const r2 = await processPacket(packet, deps);
    expect(r2.cached).toBe(true);
    expect(r2.briefing).toBeNull();
    expect(deps.metrics.llmCalls).toBe(1); // unchanged — no spend
    expect(deps.metrics.cacheHits).toBe(1);
    expect(store.size()).toBe(1);

    // 3) Materially-changed context (different invalidation) → regenerates.
    const moved = structuredClone(packet);
    moved.deterministic_levels.invalidation = 66000;
    const r3 = await processPacket(moved, deps);
    expect(r3.cached).toBe(false);
    expect(deps.metrics.llmCalls).toBe(2);
    expect(store.size()).toBe(2);

    // 4) Original signature again, but after the cooldown → regenerates.
    nowMs = T0 + COOLDOWN_MS + 1;
    const r4 = await processPacket(packet, deps);
    expect(r4.cached).toBe(false);
    expect(deps.metrics.llmCalls).toBe(3);

    await deps.bus.close();
  });
});
