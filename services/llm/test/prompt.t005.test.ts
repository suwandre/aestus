import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type ContextPacket, ContextPacket as ContextPacketSchema } from "@aestus/contracts";
import { BRIEFING_SYSTEM_PROMPT, buildBriefingMessages, extractPromptFacts } from "../src/prompt";

function loadPacket(): ContextPacket {
  const raw = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../fixtures/context/packets.json", import.meta.url)),
      "utf8",
    ),
  );
  return ContextPacketSchema.parse(Array.isArray(raw) ? raw[0] : raw);
}

describe("P13-T005 briefing prompt template", () => {
  const packet = loadPacket();
  const messages = buildBriefingMessages(packet);
  const system = messages.find((m) => m.role === "system")!.content;
  const user = messages.find((m) => m.role === "user")!.content;

  test("system prompt states the decision-support safety contract", () => {
    expect(system).toBe(BRIEFING_SYSTEM_PROMPT);
    expect(system).toContain("PROPOSAL");
    expect(system.toLowerCase()).toContain("never a command");
    expect(system).toContain("never invent price levels");
    expect(system).toContain("no_trade");
    expect(system.toLowerCase()).toContain("cite");
  });

  test("user message references the deterministic levels explicitly", () => {
    expect(user).toContain("Deterministic levels");
    // The actual engine numbers from the packet, not invented ones.
    const lv = packet.deterministic_levels;
    expect(user).toContain(String(lv.entry_zone.low));
    expect(user).toContain(String(lv.entry_zone.high));
    expect(user).toContain(String(lv.invalidation));
    for (const t of lv.targets) expect(user).toContain(String(t));
    expect(user).toContain("never introduce others");
  });

  test("user message states packet quality explicitly", () => {
    expect(user).toContain("Packet quality");
    expect(user).toContain(packet.quality.label);
    expect(user).toContain(packet.quality.score.toFixed(2));
  });

  test("user message cites context sections (anomaly + news ids)", () => {
    expect(user).toContain("Context sections");
    expect(user).toContain(packet.trigger.id);
    for (const n of packet.news) expect(user).toContain(n.id);
  });

  test("facts block still round-trips for the fake provider", () => {
    const facts = extractPromptFacts(user);
    expect(facts).not.toBeNull();
    expect(facts!.primary_asset).toBe(packet.primary_asset);
    expect(facts!.invalidation).toBe(packet.deterministic_levels.invalidation);
  });
});
