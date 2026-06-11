import { describe, expect, test } from "bun:test";
import { computeInvalidation, computeLevels, DEFAULT_LEVEL_CONFIG } from "../src/level-engine";
import type { Candle } from "../src/level-engine";
import type { LevelCandidate } from "@aestus/contracts";

const cfg = DEFAULT_LEVEL_CONFIG; // invalidationAtrBuffer 0.25, invalidationAtrMultiple 1.0

describe("P12-T007 invalidation policy", () => {
  test("long invalidation sits below the nearest support, minus the ATR buffer", () => {
    const candidates: LevelCandidate[] = [
      { price: 67850, source: "swing_low", role: "support", confidence: 0.7 },
    ];
    const res = computeInvalidation(
      "long",
      68000,
      { low: 67950, high: 68000 },
      200,
      [67850],
      [],
      candidates,
      cfg,
    )!;
    expect(res.invalidation).toBe(67800); // 67850 − 0.25·200
    // Explicit source metadata: structural source + invalidation-role candidate.
    expect(res.candidate).toMatchObject({ role: "invalidation", source: "swing_low" });
    expect(res.derivation.component).toBe("invalidation");
    expect(res.derivation.inputs.support).toBe(67850);
  });

  test("long with no structure → ATR volatility stop labelled atr_band", () => {
    const res = computeInvalidation(
      "long",
      68000,
      { low: 67950, high: 68000 },
      200,
      [],
      [],
      [],
      cfg,
    )!;
    expect(res.invalidation).toBe(67750); // entry low − 1.0·ATR
    expect(res.candidate.source).toBe("atr_band");
    expect(res.derivation.method).toContain("volatility stop");
  });

  test("short invalidation sits above the nearest resistance, plus the buffer", () => {
    const candidates: LevelCandidate[] = [
      { price: 68200, source: "swing_high", role: "resistance", confidence: 0.8 },
    ];
    const res = computeInvalidation(
      "short",
      68000,
      { low: 68000, high: 68050 },
      200,
      [],
      [68200],
      candidates,
      cfg,
    )!;
    expect(res.invalidation).toBe(68250); // 68200 + 0.25·200
    expect(res.candidate).toMatchObject({ role: "invalidation", source: "swing_high" });
  });

  test("no direction → null (engine keeps neutral reference invalidation)", () => {
    expect(
      computeInvalidation("none", 68000, { low: 68000, high: 68000 }, 200, [], [], [], cfg),
    ).toBeNull();
  });

  test("every directional briefing gets an invalidation with source metadata", () => {
    const candles: Candle[] = Array.from({ length: 20 }, (_, i) => {
      const base = 68000 + i * 10;
      return {
        time: new Date(Date.parse("2026-06-07T00:00:00.000Z") + i * 3_600_000).toISOString(),
        open: base,
        high: base + 100,
        low: base - 100,
        close: base,
        volume: 100,
      };
    });
    const levels = computeLevels({ asset: "crypto:btc-usdt", candles, direction: "long" });
    // Long invalidation is below the reference and carries a source candidate.
    expect(levels.invalidation).toBeLessThan(levels.reference_price);
    const invCand = levels.candidates.find((c) => c.role === "invalidation");
    expect(invCand).toBeDefined();
    expect(invCand!.source).toBeDefined();
    expect(levels.derivations.some((d) => d.component === "invalidation")).toBe(true);
  });
});
