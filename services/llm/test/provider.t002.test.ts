import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type ContextPacket,
  ContextPacket as ContextPacketSchema,
  Briefing,
} from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { generateBriefing } from "../src/generate";
import {
  createProvider,
  estimateMessagesTokens,
  estimateTokens,
  FakeLlmProvider,
  LlmTimeoutError,
  OllamaProvider,
  withRetry,
  withTimeout,
  type LlmCompletion,
  type LlmCompletionRequest,
  type LlmProvider,
} from "../src/provider";

function loadPacket(): ContextPacket {
  const raw = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../fixtures/context/packets.json", import.meta.url)),
      "utf8",
    ),
  );
  return ContextPacketSchema.parse(Array.isArray(raw) ? raw[0] : raw);
}

/** A second concrete provider — proves briefing logic is provider-agnostic. */
class StubProvider implements LlmProvider {
  readonly name = "stub";
  async complete(req: LlmCompletionRequest): Promise<LlmCompletion> {
    const content = JSON.stringify({
      stance: "long",
      thesis: "stub thesis",
      confidence: 0.5,
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

const noNow = () => new Date("2026-06-07T12:00:00Z");

describe("P13-T002 provider interface", () => {
  test("briefing logic is unchanged across swapped providers", async () => {
    const packet = loadPacket();
    for (const provider of [new FakeLlmProvider(), new StubProvider()]) {
      const briefing = await generateBriefing(packet, {
        provider,
        model: "any-model",
        now: noNow,
        newId: () => `b-${provider.name}`,
      });
      // Same assembly path for every provider: a valid Briefing with levels
      // copied from the packet (the provider only supplied narrative + stance).
      expect(() => Briefing.parse(briefing)).not.toThrow();
      expect(briefing.cost_metadata.provider).toBe(provider.name);
      if (briefing.stance === "long" || briefing.stance === "short") {
        expect(briefing.entry_zone).toEqual(packet.deterministic_levels.entry_zone);
        expect(briefing.invalidation).toBe(packet.deterministic_levels.invalidation);
      }
    }
  });

  test("createProvider selects fake without a key, ollama with one", () => {
    const base = loadConfig();
    expect(createProvider({ ...base, ollamaApiKey: undefined })).toBeInstanceOf(FakeLlmProvider);
    expect(createProvider({ ...base, ollamaApiKey: "sk-test" })).toBeInstanceOf(OllamaProvider);
  });

  test("withRetry retries then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("transient");
        return "ok";
      },
      { retries: 3, timeoutMs: 1000, sleep: async () => {} },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  test("withRetry throws after exhausting attempts", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("always");
        },
        { retries: 2, timeoutMs: 1000, sleep: async () => {} },
      ),
    ).rejects.toThrow("always");
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  test("withTimeout rejects a slow call", async () => {
    await expect(
      withTimeout(new Promise((r) => setTimeout(r, 50)), 5, "slow"),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
  });

  test("token estimates are deterministic", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateMessagesTokens([{ role: "user", content: "12345678" }])).toBe(2);
  });
});
