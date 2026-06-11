import { describe, expect, test } from "bun:test";
import { computeEntryZone, computeLevels, DEFAULT_LEVEL_CONFIG } from "../src/level-engine";
import type { Candle } from "../src/level-engine";

const cfg = DEFAULT_LEVEL_CONFIG; // entryAtrFraction 0.5 → halfWidth = 0.5·ATR

describe("P12-T006 entry zone policy", () => {
  test("long anchors on a nearby support (pullback entry)", () => {
    // ATR 200 → halfWidth 100; support 67950 is 50 below ref (≤ 200) → anchor.
    const { entryZone } = computeEntryZone("long", 68000, 200, [67950], [], cfg);
    expect(entryZone.low).toBe(67950);
    expect(entryZone.high).toBe(68000); // min(ref, support + halfWidth)
  });

  test("long with no nearby support → shallow pullback below reference", () => {
    const { entryZone } = computeEntryZone("long", 68000, 200, [60000], [], cfg);
    expect(entryZone.low).toBe(67900); // ref − halfWidth
    expect(entryZone.high).toBe(68000);
  });

  test("short anchors on a nearby resistance (bounce entry)", () => {
    const { entryZone } = computeEntryZone("short", 68000, 200, [], [68050], cfg);
    expect(entryZone.high).toBe(68050);
    expect(entryZone.low).toBe(68000); // max(ref, resistance − halfWidth)
  });

  test("no direction collapses the zone to the reference", () => {
    const { entryZone } = computeEntryZone("none", 68000, 200, [67000], [69000], cfg);
    expect(entryZone).toEqual({ low: 68000, high: 68000 });
  });

  test("a directional briefing receives a numeric entry zone from the engine", () => {
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
    expect(levels.direction).toBe("long");
    expect(typeof levels.entry_zone.low).toBe("number");
    expect(typeof levels.entry_zone.high).toBe("number");
    expect(levels.entry_zone.low).toBeLessThanOrEqual(levels.entry_zone.high);
    expect(levels.derivations.some((d) => d.component === "entry_zone")).toBe(true);
  });
});
