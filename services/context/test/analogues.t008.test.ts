import { describe, expect, test } from "bun:test";
import type { AnomalyEvent } from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { assembleContextPacket } from "../src/builder";

const config = loadConfig();
const ds = new FixtureDataSource(config);

// BTC funding spike — the primary asset's fixture regime is
// trending_up / high / risk_on, matching the strongest analogue exactly.
const fundingSpike: AnomalyEvent = {
  id: "anom-001",
  type: "funding_spike",
  severity: "high",
  sigma: 2.6,
  assets: ["crypto:btc-usdt"],
  venues: ["binance"],
  title: "BTC funding rate spike",
  description: "Funding z-score reached 2.6.",
  detected_at: "2026-06-07T12:00:00.000Z",
  status: "active",
  context_refs: [],
};

describe("P11-T008 historical analogues", () => {
  test("includes prior same-type analogues, regime-aligned first", () => {
    const packet = assembleContextPacket(fundingSpike, { dataSource: ds });
    expect(packet.historical_analogues.length).toBeGreaterThan(0);
    // Only funding_spike analogues — the oi_surge fixture is excluded by type.
    const descriptions = packet.historical_analogues.map((a) => a.description).join(" ");
    expect(descriptions).not.toContain("Open interest surged");
    // The all-dimensions regime match (similarity 0.86) ranks first, ahead of
    // the partial-regime 0.78 analogue and the no-regime-match 0.55 one.
    expect(packet.historical_analogues[0]!.similarity).toBe(0.86);
    const sims = packet.historical_analogues.map((a) => a.similarity);
    expect(sims).toEqual([0.86, 0.78, 0.55]);
  });

  test("respects the analogue limit", () => {
    const packet = assembleContextPacket(fundingSpike, { dataSource: ds, analogueLimit: 1 });
    expect(packet.historical_analogues.length).toBe(1);
    expect(packet.historical_analogues[0]!.similarity).toBe(0.86);
  });

  test("explicitly reports insufficient history for an unseen anomaly type", () => {
    const novel: AnomalyEvent = { ...fundingSpike, id: "anom-002", type: "correlation_break" };
    const packet = assembleContextPacket(novel, { dataSource: ds });
    // No fixture analogue for this type → empty array is the explicit signal.
    expect(packet.historical_analogues).toEqual([]);
  });
});
