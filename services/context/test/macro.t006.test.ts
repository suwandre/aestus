import { describe, expect, test } from "bun:test";
import type { AnomalyEvent } from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { assembleContextPacket } from "../src/builder";

const config = loadConfig();
const ds = new FixtureDataSource(config);

const baseTrigger: AnomalyEvent = {
  id: "anom-007",
  type: "macro_approaching",
  severity: "medium",
  sigma: null,
  assets: ["crypto:btc-usdt", "macro:dxy"],
  venues: [],
  title: "US CPI in 30 minutes",
  description: "High-importance CPI print scheduled soon.",
  detected_at: "2026-06-10T12:00:00.000Z",
  status: "active",
  context_refs: [],
};

describe("P11-T006 macro retrieval", () => {
  test("identifies imminent CPI proximity for a macro-approaching anomaly", () => {
    const packet = assembleContextPacket(baseTrigger, {
      dataSource: ds,
      macroWindowHours: 72,
      macroMinImportance: "medium",
    });
    expect(packet.macro.length).toBeGreaterThan(0);
    // Closest event is the CPI 30 minutes ahead.
    expect(packet.macro[0]!.event_id).toBe("us-cpi-2026-06");
    expect(packet.macro[0]!.importance).toBe("high");
  });

  test("captures both recent and upcoming events within the window", () => {
    // Anomaly at 06-07 12:00, ±96h window: NFP (06-05, recent) + CPI (06-10, upcoming).
    const trigger = { ...baseTrigger, detected_at: "2026-06-07T12:00:00.000Z" };
    const packet = assembleContextPacket(trigger, {
      dataSource: ds,
      macroWindowHours: 96,
      macroMinImportance: "medium",
    });
    const ids = packet.macro.map((m) => m.event_id);
    expect(ids).toContain("us-nfp-2026-06"); // recent (high)
    expect(ids).toContain("us-cpi-2026-06"); // upcoming (high)
  });
});
