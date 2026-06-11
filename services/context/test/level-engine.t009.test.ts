import { describe, expect, test } from "bun:test";
import { computeLevels, computeSizeSuggestion, DEFAULT_LEVEL_CONFIG } from "../src/level-engine";
import type { Candle } from "../src/level-engine";

const cfg = DEFAULT_LEVEL_CONFIG; // maxRiskPct 0.01, sizeBaselineVolPct 0.02, sizeMinVolFactor 0.5
const entry = { low: 67900, high: 68000 }; // mid 67950

describe("P12-T009 size suggestion policy", () => {
  test("full conviction, calm vol → risk = max risk; expressed as risk %, no quantity", () => {
    const res = computeSizeSuggestion("long", entry, 67750, 200, 68000, 1.0, undefined, cfg)!;
    expect(res.size.risk_pct).toBe(0.01);
    expect(res.size.notional).toBeUndefined();
    expect(res.size.note).toContain("1.00%");
    expect(res.size.note).toContain("not an order size");
    // Structurally risk-relative: only risk_pct / notional / note exist — no qty.
    expect(Object.keys(res.size).sort()).toEqual(["note", "risk_pct"]);
  });

  test("confidence scales risk linearly", () => {
    const half = computeSizeSuggestion("long", entry, 67750, 200, 68000, 0.5, undefined, cfg)!;
    expect(half.size.risk_pct).toBe(0.005);
  });

  test("high volatility applies a haircut (floored)", () => {
    // ATR 3000 → ATR/price ≈ 4.4% > 2% baseline → factor floored at 0.5.
    const res = computeSizeSuggestion("long", entry, 67750, 3000, 68000, 1.0, undefined, cfg)!;
    expect(res.size.risk_pct).toBe(0.005);
    expect(res.derivation.inputs.vol_factor).toBe(0.5);
  });

  test("notional derives from stop distance when account equity is known", () => {
    const res = computeSizeSuggestion("long", entry, 67750, 200, 68000, 1.0, 10_000, cfg)!;
    // 10000·0.01·67950 / 200 = 33975
    expect(res.size.notional).toBeCloseTo(33975, 0);
    expect(res.size.note).toContain("notional");
  });

  test("no direction → no size", () => {
    expect(computeSizeSuggestion("none", entry, 67750, 200, 68000, 1.0, undefined, cfg)).toBeNull();
  });

  test("computeLevels attaches size for directional, null for no-direction", () => {
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
    const long = computeLevels({ asset: "crypto:btc-usdt", candles, direction: "long" });
    expect(long.size_suggestion).not.toBeNull();
    expect(long.size_suggestion!.risk_pct!).toBeGreaterThan(0);
    expect(long.size_suggestion!.risk_pct!).toBeLessThanOrEqual(cfg.maxRiskPct);
    expect(long.derivations.some((d) => d.component === "size")).toBe(true);

    const none = computeLevels({ asset: "crypto:btc-usdt", candles });
    expect(none.size_suggestion).toBeNull();
  });
});
