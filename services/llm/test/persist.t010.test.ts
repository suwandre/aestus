import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type ContextPacket,
  ContextPacket as ContextPacketSchema,
  Briefing,
} from "@aestus/contracts";
import { generateBriefing } from "../src/generate";
import { FakeLlmProvider } from "../src/provider";
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

async function makeBriefing() {
  return generateBriefing(loadPacket(), {
    provider: new FakeLlmProvider(),
    model: "kimi-k2.6",
    now: () => new Date("2026-06-07T12:00:00Z"),
    newId: () => "b-persist",
  });
}

describe("P13-T010 persist briefing and metadata", () => {
  test("briefing carries the observability metadata the detail view needs", async () => {
    const b = await makeBriefing();
    // text + structured fields
    expect(b.thesis.length).toBeGreaterThan(0);
    expect(Array.isArray(b.factors)).toBe(true);
    expect(b.context_packet_id).toBe("ctx-001");
    // model + token usage + cost (hard rule #7)
    expect(b.model).toBe("kimi-k2.6");
    expect(b.cost_metadata.provider).toBe("fake");
    expect(b.cost_metadata.prompt_tokens).toBeGreaterThan(0);
    expect(b.cost_metadata.completion_tokens).toBeGreaterThan(0);
    expect(b.cost_metadata.total_tokens).toBe(
      b.cost_metadata.prompt_tokens + b.cost_metadata.completion_tokens,
    );
    expect(typeof b.cost_metadata.cost_usd).toBe("number");
    // cache hit observability
    expect(b.cache_hit).toBe(false);
  });

  test("store round-trips the full briefing including new fields", async () => {
    const store = new InMemoryBriefingStore();
    const b = await makeBriefing();
    await store.save(b);
    const got = await store.get(b.id);
    expect(got).toEqual(b);
    const byPacket = await store.byPacket(b.context_packet_id);
    expect(byPacket).toEqual([b]);
  });

  test("Briefing contract defaults cache_hit when absent (back-compat)", () => {
    const minimal = {
      id: "x",
      schema_version: 1,
      context_packet_id: "ctx-001",
      generated_at: "2026-06-07T12:00:00.000Z",
      stance: "no_trade",
      thesis: "stand aside",
      entry_zone: null,
      invalidation: null,
      size_suggestion: null,
      timeframe: "until re-check",
      confidence: 0.7,
      model: "kimi-k2.6",
      cost_metadata: {
        provider: "ollama",
        model: "kimi-k2.6",
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
        cost_usd: 0,
      },
    };
    const parsed = Briefing.parse(minimal);
    expect(parsed.cache_hit).toBe(false);
    expect(parsed.factors).toEqual([]);
  });

  test("migration 0013 adds the metadata columns", () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL("../../../infra/migrations/postgres/0013_briefing_metadata.sql", import.meta.url),
      ),
      "utf8",
    );
    for (const col of [
      "factors",
      "invalidation_reasoning",
      "confidence_reasoning",
      "recheck_condition",
      "cache_hit",
      "snapshot",
    ]) {
      expect(sql).toContain(col);
    }
  });
});
