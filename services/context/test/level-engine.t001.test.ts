import { describe, expect, test } from "bun:test";
import { DeterministicLevels } from "@aestus/contracts";
import { computeLevels, resolveDirection, resolveReferencePrice } from "../src/level-engine";
import type { Candle, LevelEngineInput } from "../src/level-engine";

/** A tiny ascending candle series (oldest→newest). */
const candles: Candle[] = [
  {
    time: "2026-06-07T09:00:00.000Z",
    open: 67800,
    high: 68100,
    low: 67700,
    close: 68000,
    volume: 120,
  },
  {
    time: "2026-06-07T10:00:00.000Z",
    open: 68000,
    high: 68400,
    low: 67950,
    close: 68300,
    volume: 140,
  },
  {
    time: "2026-06-07T11:00:00.000Z",
    open: 68300,
    high: 68500,
    low: 68150,
    close: 68250,
    volume: 110,
  },
];

describe("P12-T001 level engine module", () => {
  test("computeLevels returns a contract-valid DeterministicLevels", () => {
    const input: LevelEngineInput = { asset: "crypto:btc-usdt", candles };
    const levels = computeLevels(input);
    // Output validates against the shared contract — typed output, no LLM input.
    expect(() => DeterministicLevels.parse(levels)).not.toThrow();
    expect(levels.reference_price).toBe(68250);
  });

  test("reference price falls back to the last candle close, else explicit override wins", () => {
    expect(resolveReferencePrice({ asset: "x", candles })).toBe(68250);
    expect(resolveReferencePrice({ asset: "x", candles, referencePrice: 70000 })).toBe(70000);
    expect(resolveReferencePrice({ asset: "x", candles: [] })).toBe(0);
  });

  test("direction is explicit when given, else inferred deterministically from regime trend", () => {
    expect(resolveDirection({ asset: "x", candles, direction: "short" })).toBe("short");
    expect(resolveDirection({ asset: "x", candles, regimeTrend: "trending_up" })).toBe("long");
    expect(resolveDirection({ asset: "x", candles, regimeTrend: "trending_down" })).toBe("short");
    expect(resolveDirection({ asset: "x", candles, regimeTrend: "ranging" })).toBe("none");
    expect(resolveDirection({ asset: "x", candles })).toBe("none");
  });

  test("the engine records a derivation for the reference price (audit trail seed)", () => {
    const levels = computeLevels({ asset: "x", candles });
    expect(levels.derivations.some((d) => d.component === "reference_price")).toBe(true);
  });
});
