import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type ContextPacket, ContextPacket as ContextPacketSchema } from "@aestus/contracts";
import { BriefingDraft } from "../src/draft";
import { generateBriefing } from "../src/generate";
import { allowedPrices, buildBriefingMessages } from "../src/prompt";
import { FakeLlmProvider } from "../src/provider";

function loadPacket(): ContextPacket {
  const raw = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../fixtures/context/packets.json", import.meta.url)),
      "utf8",
    ),
  );
  return ContextPacketSchema.parse(Array.isArray(raw) ? raw[0] : raw);
}

describe("P13-T007 deterministic level injection", () => {
  const packet = loadPacket();
  const user = buildBriefingMessages(packet).find((m) => m.role === "user")!.content;

  test("prompt forbids inventing unprovided price levels", () => {
    expect(user).toContain("Price guardrail");
    expect(user).toContain("ONLY these exact prices");
    expect(user.toLowerCase()).toContain("never invent");
    expect(user).toContain("do NOT output any price");
  });

  test("allowedPrices is exactly the engine's level set, deduped and sorted", () => {
    const prices = allowedPrices(packet);
    const lv = packet.deterministic_levels;
    expect(prices).toContain(lv.entry_zone.low);
    expect(prices).toContain(lv.entry_zone.high);
    expect(prices).toContain(lv.invalidation);
    for (const t of lv.targets) expect(prices).toContain(t);
    // sorted ascending, unique
    expect(prices).toEqual([...new Set(prices)].sort((a, b) => a - b));
    // the prompt enumerates the same set
    for (const p of prices) expect(user).toContain(String(p));
  });

  test("the model-output schema has no price fields — it cannot emit a level", () => {
    const keys = Object.keys(BriefingDraft.shape);
    for (const forbidden of ["entry_zone", "invalidation", "targets", "size_suggestion", "price"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  test("every numeric level on the assembled briefing comes from the engine", async () => {
    const allowed = new Set(allowedPrices(packet));
    const briefing = await generateBriefing(packet, {
      provider: new FakeLlmProvider(),
      model: "kimi-k2.6",
      now: () => new Date("2026-06-07T12:00:00Z"),
      newId: () => "b1",
    });
    if (briefing.stance === "long" || briefing.stance === "short") {
      expect(allowed.has(briefing.entry_zone!.low)).toBe(true);
      expect(allowed.has(briefing.entry_zone!.high)).toBe(true);
      expect(allowed.has(briefing.invalidation!)).toBe(true);
      for (const t of briefing.targets) expect(allowed.has(t)).toBe(true);
    }
  });
});
