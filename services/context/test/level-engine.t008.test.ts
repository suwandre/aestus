import { describe, expect, test } from "bun:test";
import { computeLevels, computeTargets, DEFAULT_LEVEL_CONFIG } from "../src/level-engine";
import type { Candle } from "../src/level-engine";
import type { LevelCandidate } from "@aestus/contracts";

const cfg = DEFAULT_LEVEL_CONFIG; // targetAtrMultiples [1,2,3], maxTargets 5, srTolerancePct 0.004

describe("P12-T008 target policy", () => {
  test("long targets combine structure, ATR multiples, and liquidity clusters", () => {
    const candidates: LevelCandidate[] = [
      { price: 68500, source: "swing_high", role: "resistance", confidence: 0.8 },
      { price: 69300, source: "liquidation_cluster", role: "target", confidence: 0.9 },
    ];
    const res = computeTargets(
      "long",
      68000,
      { low: 67900, high: 68000 },
      200,
      [], // supports
      [68500], // resistances
      candidates,
      cfg,
    );
    // ATR targets 68200/68400/68600 + structural 68500 + liq 69300, merged @ tol 272.
    expect(res.targets).toEqual([68200, 68500, 69300]);
    // Derivation labels: new target-role candidates carry source + note.
    const atrTarget = res.candidates.find((c) => c.price === 68200);
    const structTarget = res.candidates.find((c) => c.price === 68500);
    expect(atrTarget).toMatchObject({ role: "target", source: "atr_band" });
    expect(atrTarget!.note).toContain("ATR");
    expect(structTarget).toMatchObject({ role: "target", source: "swing_high", note: "structure" });
    // The pre-existing liquidation target is not duplicated.
    expect(res.candidates.some((c) => c.price === 69300)).toBe(false);
    expect(res.derivation.component).toBe("targets");
    expect(res.derivation.outputs).toEqual([68200, 68500, 69300]);
  });

  test("short targets are below the reference, nearest-first", () => {
    const res = computeTargets("short", 68000, { low: 68000, high: 68100 }, 200, [], [], [], cfg);
    expect(res.targets.length).toBeGreaterThan(0);
    for (const t of res.targets) expect(t).toBeLessThan(68000);
    // Descending (nearest below first).
    const sorted = [...res.targets].sort((a, b) => b - a);
    expect(res.targets).toEqual(sorted);
  });

  test("no direction → no targets", () => {
    const res = computeTargets(
      "none",
      68000,
      { low: 68000, high: 68000 },
      200,
      [],
      [69000],
      [],
      cfg,
    );
    expect(res.targets).toEqual([]);
    expect(res.candidates).toEqual([]);
  });

  test("a directional briefing has deterministic targets with derivation labels", () => {
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
    expect(levels.targets.length).toBeGreaterThan(0);
    for (const t of levels.targets) expect(t).toBeGreaterThan(levels.reference_price);
    // Every target-role candidate carries a source label (its derivation).
    const targetCands = levels.candidates.filter((c) => c.role === "target");
    expect(targetCands.length).toBeGreaterThan(0);
    for (const c of targetCands) expect(c.source).toBeDefined();
    expect(levels.derivations.some((d) => d.component === "targets")).toBe(true);
  });
});
