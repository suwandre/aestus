import { describe, expect, test } from "bun:test";
import type { AnomalyEvent } from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { assembleContextPacket } from "../src/builder";
import { buildVenueComparison } from "../src/venue";

const config = loadConfig();
const thresholds = {
  fundingDispersion: config.venueFundingDispersion,
  basisDispersionBps: config.venueBasisDispersionBps,
};

const trigger: AnomalyEvent = {
  id: "anom-005",
  type: "basis_dislocation",
  severity: "low",
  sigma: 1.5,
  assets: ["crypto:btc-usdt"],
  venues: ["binance", "okx"],
  title: "Cross-venue basis dislocation",
  description: "Binance-OKX perp basis widened.",
  detected_at: "2026-06-07T12:04:00.000Z",
  status: "active",
  context_refs: [],
};

describe("P11-T004 venue comparison", () => {
  test("flags a venue-specific dislocation and names the outlier", () => {
    const ds = new FixtureDataSource(config);
    const packet = assembleContextPacket(trigger, { dataSource: ds, venueThresholds: thresholds });
    const vc = packet.venue_comparison;
    expect(vc).toBeDefined();
    expect(vc!.quotes.length).toBe(3); // binance, bybit, okx
    expect(vc!.is_venue_specific).toBe(true);
    expect(vc!.outlier_venue).toBe("okx");
    expect(vc!.basis_dispersion_bps).toBeCloseTo(29.2);
    expect(vc!.notes).toContain("okx");
  });

  test("aligned venues read as market-wide, not venue-specific", () => {
    const ds = new FixtureDataSource(config);
    const quotes = ds.venueQuotes("crypto:eth-usdt");
    const vc = buildVenueComparison("crypto:eth-usdt", quotes, thresholds);
    expect(vc.is_venue_specific).toBe(false);
    expect(vc.outlier_venue).toBeNull();
    expect(vc.notes).toContain("market-wide");
  });
});
