import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ContextPacket as ContextPacketSchema, Briefing } from "@aestus/contracts";
import { generateBriefing } from "../src/generate";
import { allowedPrices, buildBriefingMessages } from "../src/prompt";
import { FakeLlmProvider } from "../src/provider";
import { validateBriefing } from "../src/validate";

interface RegressionCase {
  name: string;
  expect: {
    stance: "long" | "short" | "no_trade";
    directional: boolean;
    minConfidence?: number;
    maxConfidence?: number;
  };
  packet: unknown;
}

const cases = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/regression-cases.json", import.meta.url)), "utf8"),
) as RegressionCase[];

const fixedNow = () => new Date("2026-06-07T12:00:00Z");

describe("P13-T013 prompt regression fixtures", () => {
  test("representative cases are present", () => {
    expect(cases.map((c) => c.name).sort()).toEqual(
      ["long-strong", "no-trade", "short", "weak-quality"].sort(),
    );
  });

  for (const c of cases) {
    describe(c.name, () => {
      // Schema regression: a ContextPacket contract change that breaks the
      // stored fixture fails here.
      const packet = ContextPacketSchema.parse(c.packet);

      test("prompt keeps its safety guardrails", () => {
        const messages = buildBriefingMessages(packet);
        const system = messages.find((m) => m.role === "system")!.content;
        const user = messages.find((m) => m.role === "user")!.content;
        expect(system).toContain("never invent price levels");
        expect(system).toContain("PROPOSAL");
        expect(user).toContain("Price guardrail");
        expect(user.toLowerCase()).toContain("never invent");
      });

      test("briefing matches expected stance and is schema-valid + safe", async () => {
        const briefing = await generateBriefing(packet, {
          provider: new FakeLlmProvider(),
          model: "kimi-k2.6",
          now: fixedNow,
          newId: () => `b-${c.name}`,
        });
        expect(briefing.stance).toBe(c.expect.stance);
        // Schema regression.
        expect(() => Briefing.parse(briefing)).not.toThrow();
        // Safety regression: no execution language, directional has invalidation.
        expect(validateBriefing(briefing).ok).toBe(true);
        // Levels only from the engine.
        const allowed = new Set(allowedPrices(packet));
        if (c.expect.directional) {
          expect(briefing.invalidation).not.toBeNull();
          expect(allowed.has(briefing.entry_zone!.low)).toBe(true);
          for (const t of briefing.targets) expect(allowed.has(t)).toBe(true);
        } else {
          expect(briefing.entry_zone).toBeNull();
          expect(briefing.invalidation).toBeNull();
        }
        if (c.expect.minConfidence !== undefined) {
          expect(briefing.confidence).toBeGreaterThanOrEqual(c.expect.minConfidence);
        }
        if (c.expect.maxConfidence !== undefined) {
          expect(briefing.confidence).toBeLessThanOrEqual(c.expect.maxConfidence);
        }
      });
    });
  }
});
