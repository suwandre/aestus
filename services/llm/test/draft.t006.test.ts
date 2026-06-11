import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type ContextPacket,
  ContextPacket as ContextPacketSchema,
  Briefing,
} from "@aestus/contracts";
import { BriefingDraft, InvalidBriefingDraftError, parseBriefingDraft } from "../src/draft";
import { generateBriefing } from "../src/generate";
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

const FULL: BriefingDraft = {
  stance: "long",
  thesis: "valid thesis",
  factors: ["a", "b"],
  invalidation_reasoning: "below the swing low",
  confidence_reasoning: "strong context",
  recheck_condition: "if funding cools",
  confidence: 0.6,
  timeframe: "swing",
};

describe("P13-T006 structured briefing output schema", () => {
  test("accepts a fully-conformant draft", () => {
    const draft = parseBriefingDraft(JSON.stringify(FULL));
    expect(BriefingDraft.parse(draft)).toEqual(FULL);
  });

  test("requires the six structured fields (schema shape)", () => {
    expect(Object.keys(BriefingDraft.shape).sort()).toEqual(
      [
        "confidence",
        "confidence_reasoning",
        "factors",
        "invalidation_reasoning",
        "recheck_condition",
        "stance",
        "thesis",
        "timeframe",
      ].sort(),
    );
  });

  test("repairs missing narrative fields with safe defaults", () => {
    const draft = parseBriefingDraft(
      JSON.stringify({ stance: "short", thesis: "t", confidence: 0.4, timeframe: "intraday" }),
    );
    expect(draft.factors).toEqual([]);
    expect(draft.invalidation_reasoning).toBe("");
    expect(draft.confidence_reasoning).toBe("");
    expect(draft.recheck_condition).toBe("");
  });

  test("repairs out-of-range / missing / string confidence", () => {
    expect(parseBriefingDraft(JSON.stringify({ ...FULL, confidence: 1.5 })).confidence).toBe(1);
    expect(parseBriefingDraft(JSON.stringify({ ...FULL, confidence: -2 })).confidence).toBe(0);
    expect(parseBriefingDraft(JSON.stringify({ ...FULL, confidence: "0.7" })).confidence).toBe(0.7);
    const noConf: Record<string, unknown> = { ...FULL };
    delete noConf.confidence;
    expect(parseBriefingDraft(JSON.stringify(noConf)).confidence).toBe(0.5);
  });

  test("repairs missing timeframe and filters non-string factors", () => {
    const draft = parseBriefingDraft(
      JSON.stringify({ stance: "long", thesis: "t", confidence: 0.5, factors: ["ok", 3, null] }),
    );
    expect(draft.timeframe).toBe("unspecified");
    expect(draft.factors).toEqual(["ok"]);
  });

  test("extracts JSON wrapped in prose or code fences", () => {
    const wrapped =
      "Sure, here is the briefing:\n```json\n" + JSON.stringify(FULL) + "\n```\nDone.";
    expect(parseBriefingDraft(wrapped).stance).toBe("long");
  });

  test("rejects output missing an essential field", () => {
    expect(() =>
      parseBriefingDraft(JSON.stringify({ thesis: "no stance", confidence: 0.5 })),
    ).toThrow(InvalidBriefingDraftError);
    expect(() => parseBriefingDraft(JSON.stringify({ stance: "long", confidence: 0.5 }))).toThrow(
      InvalidBriefingDraftError,
    );
    expect(() =>
      parseBriefingDraft(
        JSON.stringify({ stance: "sideways", thesis: "bad enum", confidence: 0.5 }),
      ),
    ).toThrow(InvalidBriefingDraftError);
  });

  test("rejects non-JSON output", () => {
    expect(() => parseBriefingDraft("the model refused")).toThrow(InvalidBriefingDraftError);
  });

  test("narrative fields flow through to the assembled Briefing", async () => {
    const briefing = await generateBriefing(loadPacket(), {
      provider: new FakeLlmProvider(),
      model: "kimi-k2.6",
      now: () => new Date("2026-06-07T12:00:00Z"),
      newId: () => "b1",
    });
    expect(() => Briefing.parse(briefing)).not.toThrow();
    expect(briefing.factors.length).toBeGreaterThan(0);
    expect(briefing.invalidation_reasoning).toBeTruthy();
    expect(briefing.confidence_reasoning).toBeTruthy();
    expect(briefing.recheck_condition).toBeTruthy();
  });
});
