import { describe, expect, test } from "bun:test";
import { InMemoryBus } from "@aestus/event-bus";
import type { AnomalyEvent, ContextPacket } from "@aestus/contracts";
import { loadConfig } from "../src/config";
import { FixtureDataSource } from "../src/data/fixtures";
import { newMetrics } from "../src/health";
import { processAnomaly } from "../src/service";
import { placeholderLevels } from "../src/levels";
import { InMemoryPacketStore, type PacketStore } from "../src/store";

const config = loadConfig();
const ds = new FixtureDataSource(config);

const trigger: AnomalyEvent = {
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

describe("P11-T010 context packet persistence", () => {
  test("stores the full packet snapshot, reproducible by id", async () => {
    const bus = new InMemoryBus();
    const store = new InMemoryPacketStore();
    const packet = await processAnomaly(trigger, {
      bus,
      config,
      metrics: newMetrics(),
      dataSource: ds,
      store,
    });

    const reproduced = await store.get(packet.id);
    // The stored snapshot reproduces the published packet exactly, including
    // sections the normalized columns don't model (e.g. source_freshness).
    expect(reproduced).toEqual(packet);
    expect(reproduced!.source_freshness.length).toBeGreaterThan(0);
    await bus.close();
  });

  test("persists BEFORE publishing — a publish failure leaves the packet stored", async () => {
    // Bus that rejects on publish; persistence must already have happened.
    const failingBus = {
      publish: () => Promise.reject(new Error("bus down")),
      subscribe: () => Promise.reject(new Error("unused")),
      close: () => Promise.resolve(),
    } as unknown as InMemoryBus;
    const store = new InMemoryPacketStore();

    await expect(
      processAnomaly(trigger, {
        bus: failingBus,
        config,
        metrics: newMetrics(),
        dataSource: ds,
        store,
      }),
    ).rejects.toThrow("bus down");

    // The packet was saved before the publish attempt blew up.
    expect(store.size()).toBe(1);
    const reproduced = await store.get(`ctx:${trigger.id}`);
    expect(reproduced?.trigger.id).toBe("anom-001");
  });

  test("snapshot is immutable — mutating the source packet does not rewrite history", async () => {
    const store: PacketStore = new InMemoryPacketStore();
    const packet: ContextPacket = {
      id: "ctx:mut",
      schema_version: 1,
      generated_at: "2026-06-07T12:00:05.000Z",
      primary_asset: "crypto:btc-usdt",
      trigger,
      market_snapshot: {
        schema_version: 1,
        canonical_asset_id: "crypto:btc-usdt",
        timestamp: "2026-06-07T12:00:00.000Z",
        returns: {},
        volatility: {},
        z_scores: {},
        funding_z: null,
        oi_delta: null,
        volume_z: null,
        correlation_set: [],
        basis: [],
        regime: { trend: "ranging", volatility: "normal", risk: "neutral" },
      },
      correlated_assets: [],
      news: [],
      macro: [],
      on_chain: [],
      historical_analogues: [],
      source_freshness: [],
      quality: { score: 0, label: "weak", degraded_feeds: [], notes: "test packet" },
      deterministic_levels: placeholderLevels(),
    };
    await store.save(packet);
    packet.primary_asset = "crypto:eth-usdt"; // mutate after save
    const reproduced = await store.get("ctx:mut");
    expect(reproduced?.primary_asset).toBe("crypto:btc-usdt");
  });
});
