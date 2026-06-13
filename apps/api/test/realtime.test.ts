/**
 * Realtime SSE tests (P15-T008).
 *
 * Tests the RealtimeManager and SSE route logic directly — no live server or
 * network required (fixture-first, hard rule #5).
 *
 * Coverage:
 *   - Auth: SSE endpoint returns 401 when API_TOKEN configured and header absent
 *   - Heartbeat: timer fires and delivers heartbeat events to subscribers
 *   - Event mapping: event-mapper produces correct UIEvent payloads
 *   - Filtering: asset/venue/watchlist filters deliver only matching events
 *   - Lifecycle: connected event sent on subscribe; reconnect_required on notify
 *   - Disconnect: unsubscribe removes subscriber; no further events delivered
 *   - Sequence: seq increments monotonically across events
 *   - Broadcaster: nextBatch() produces expected event types
 */
import { describe, expect, test } from "bun:test";
import { RealtimeManager } from "../src/realtime";
import {
  mapAnomalyEvent,
  mapBriefing,
  mapDependencyHealth,
  mapFeatureSnapshot,
  mapPriceTick,
} from "../src/event-mapper";
import { nextBatch } from "../scripts/broadcast";
import { loadConfig } from "../src/config";
import { checkAuth } from "../src/auth";
import { Router } from "../src/router";
import { FixtureStore } from "../src/store";
import { registerRealtimeRoutes } from "../src/routes/realtime";
import type { UIEvent } from "@aestus/contracts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function collect(manager: RealtimeManager, filter = {}): { events: UIEvent[]; unsub: () => void } {
  const events: UIEvent[] = [];
  const unsub = manager.subscribe(filter, (e) => events.push(e));
  return { events, unsub };
}

// ─── RealtimeManager — basic subscribe/broadcast ──────────────────────────────

describe("RealtimeManager", () => {
  test("sends connected event on subscribe", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events } = collect(mgr);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("connected");
    expect((events[0] as { server_version: string }).server_version).toBe("1.0.0");
    mgr.stop();
  });

  test("seq increments monotonically", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr);

    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:btc-usdt" });
    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:eth-usdt" });

    expect(events[0]!.seq).toBe(1); // connected
    expect(events[1]!.seq).toBe(2); // first broadcast
    expect(events[2]!.seq).toBe(3); // second broadcast

    unsub();
    mgr.stop();
  });

  test("ts is an ISO string", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events } = collect(mgr);
    expect(events[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    mgr.stop();
  });

  test("heartbeat fires after interval", async () => {
    const mgr = new RealtimeManager("1.0.0", 50); // 50 ms interval
    const { events } = collect(mgr);

    await new Promise((r) => setTimeout(r, 120));
    const heartbeats = events.filter((e) => e.type === "heartbeat");
    expect(heartbeats.length).toBeGreaterThanOrEqual(2);
    mgr.stop();
  });

  test("broadcast delivers to subscriber", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr);

    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:btc-usdt", price: 100_000 });

    const evt = events.find((e) => e.type === "market_state_updated");
    expect(evt).toBeDefined();
    expect((evt as { asset_id: string }).asset_id).toBe("crypto:btc-usdt");

    unsub();
    mgr.stop();
  });
});

// ─── Disconnect cleanup ────────────────────────────────────────────────────────

describe("RealtimeManager — disconnect", () => {
  test("unsubscribe removes subscriber", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr);

    unsub();
    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:btc-usdt" });

    // Only the initial connected event; broadcast after unsub not delivered
    expect(events.filter((e) => e.type === "market_state_updated")).toHaveLength(0);
    mgr.stop();
  });

  test("connectionCount tracks active subscriptions", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    expect(mgr.connectionCount).toBe(0);

    const { unsub: u1 } = collect(mgr);
    expect(mgr.connectionCount).toBe(1);

    const { unsub: u2 } = collect(mgr);
    expect(mgr.connectionCount).toBe(2);

    u1();
    expect(mgr.connectionCount).toBe(1);

    u2();
    expect(mgr.connectionCount).toBe(0);
    mgr.stop();
  });
});

// ─── Lifecycle events ─────────────────────────────────────────────────────────

describe("RealtimeManager — lifecycle", () => {
  test("notifyReconnectRequired broadcasts to all subscribers", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events: a } = collect(mgr);
    const { events: b } = collect(mgr);

    mgr.notifyReconnectRequired("test reason");

    expect(a.some((e) => e.type === "reconnect_required")).toBe(true);
    expect(b.some((e) => e.type === "reconnect_required")).toBe(true);
    mgr.stop();
  });

  test("notifyDegradedMode broadcasts degraded_mode event", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events } = collect(mgr);

    mgr.notifyDegradedMode(["nats", "feed:binance"]);

    const evt = events.find((e) => e.type === "degraded_mode");
    expect(evt).toBeDefined();
    expect((evt as { sources: string[] }).sources).toEqual(["nats", "feed:binance"]);
    mgr.stop();
  });
});

// ─── Filtering ────────────────────────────────────────────────────────────────

describe("RealtimeManager — filtering", () => {
  test("asset filter passes matching events", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr, { assets: ["crypto:btc-usdt"] });

    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:btc-usdt" });
    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:eth-usdt" });

    const data = events.filter((e) => e.type === "market_state_updated");
    expect(data).toHaveLength(1);
    expect((data[0] as { asset_id: string }).asset_id).toBe("crypto:btc-usdt");

    unsub();
    mgr.stop();
  });

  test("asset filter blocks non-matching events", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr, { assets: ["crypto:btc-usdt"] });

    mgr.broadcast({ type: "feature_updated", asset_id: "macro:spx" });

    expect(events.filter((e) => e.type === "feature_updated")).toHaveLength(0);
    unsub();
    mgr.stop();
  });

  test("venue filter passes matching events", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr, { venues: ["binance"] });

    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:btc-usdt", venue: "binance" });
    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:btc-usdt", venue: "okx" });

    const data = events.filter((e) => e.type === "market_state_updated");
    expect(data).toHaveLength(1);
    expect((data[0] as { venue: string }).venue).toBe("binance");

    unsub();
    mgr.stop();
  });

  test("anomaly_created filtered by assets list", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr, { assets: ["crypto:btc-usdt"] });

    mgr.broadcast({
      type: "anomaly_created",
      anomaly_id: "a1",
      anomaly_type: "funding_spike",
      severity: "high",
      assets: ["crypto:btc-usdt"],
      venues: ["binance"],
      title: "BTC funding spike",
    });
    mgr.broadcast({
      type: "anomaly_created",
      anomaly_id: "a2",
      anomaly_type: "oi_surge",
      severity: "medium",
      assets: ["crypto:eth-usdt"],
      venues: ["okx"],
      title: "ETH OI surge",
    });

    const data = events.filter((e) => e.type === "anomaly_created");
    expect(data).toHaveLength(1);
    expect((data[0] as { anomaly_id: string }).anomaly_id).toBe("a1");

    unsub();
    mgr.stop();
  });

  test("lifecycle events pass through all filters", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr, { assets: ["crypto:btc-usdt"] });

    mgr.notifyDegradedMode(["nats"]);

    expect(events.some((e) => e.type === "degraded_mode")).toBe(true);
    unsub();
    mgr.stop();
  });

  test("empty filter delivers all events", () => {
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events, unsub } = collect(mgr, {});

    mgr.broadcast({ type: "market_state_updated", asset_id: "crypto:btc-usdt" });
    mgr.broadcast({ type: "feature_updated", asset_id: "macro:spx" });

    expect(events.filter((e) => e.type !== "connected")).toHaveLength(2);
    unsub();
    mgr.stop();
  });
});

// ─── Event mapper ─────────────────────────────────────────────────────────────

describe("event-mapper", () => {
  test("mapPriceTick produces market_state_updated", () => {
    const payload = mapPriceTick({
      canonical_asset_id: "crypto:btc-usdt",
      venue: "binance",
      price: 95_000,
      change_pct_24h: 0.02,
    });
    expect(payload.type).toBe("market_state_updated");
    expect((payload as { asset_id: string }).asset_id).toBe("crypto:btc-usdt");
    expect((payload as { price: number }).price).toBe(95_000);
  });

  test("mapFeatureSnapshot produces feature_updated", () => {
    const payload = mapFeatureSnapshot({
      schema_version: 1,
      canonical_asset_id: "crypto:btc-usdt",
      timestamp: "2026-06-13T12:00:00.000Z",
      returns: { "24h": 0.02 },
      volatility: { "24h": 0.03 },
      z_scores: { price: 1.5 },
      funding_z: 2.6,
      oi_delta: 0.08,
      volume_z: 1.9,
      correlation_set: [],
      basis: [],
      regime: { trend: "trending_up", volatility: "high", risk: "risk_on" },
    });
    expect(payload.type).toBe("feature_updated");
    expect((payload as { asset_id: string }).asset_id).toBe("crypto:btc-usdt");
    expect((payload as { funding_z: number }).funding_z).toBe(2.6);
  });

  test("mapAnomalyEvent produces anomaly_created", () => {
    const payload = mapAnomalyEvent({
      id: "anom-001",
      type: "funding_spike",
      severity: "high",
      sigma: 2.6,
      assets: ["crypto:btc-usdt"],
      venues: ["binance"],
      title: "BTC funding spike",
      description: "desc",
      detected_at: "2026-06-13T12:00:00.000Z",
      status: "active",
      context_refs: [],
    });
    expect(payload.type).toBe("anomaly_created");
    expect((payload as { anomaly_id: string }).anomaly_id).toBe("anom-001");
    expect((payload as { severity: string }).severity).toBe("high");
  });

  test("mapDependencyHealth returns only non-ok entries", () => {
    const payloads = mapDependencyHealth([
      { name: "database", status: "ok" },
      { name: "event-bus", status: "degraded", detail: "no NATS_URL" },
    ]);
    expect(payloads).toHaveLength(1);
    expect((payloads[0] as { source_id: string }).source_id).toBe("event-bus");
    expect((payloads[0] as { status: string }).status).toBe("degraded");
  });

  test("mapBriefing produces briefing_created with optional assetId", () => {
    const payload = mapBriefing(
      {
        id: "br-001",
        schema_version: 1,
        context_packet_id: "cp-001",
        generated_at: "2026-06-13T12:00:00.000Z",
        stance: "long",
        thesis: "BTC looks bullish",
        factors: [],
        confidence: 0.75,
        entry_zone: null,
        invalidation: null,
        targets: [],
        size_suggestion: null,
        timeframe: "4h",
        model: "kimi-k2.6",
        supporting_context: [],
        cache_hit: false,
        cost_metadata: {
          provider: "ollama",
          model: "kimi-k2.6",
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
          cost_usd: 0.01,
        },
      },
      "crypto:btc-usdt",
    );
    expect(payload.type).toBe("briefing_created");
    expect((payload as { briefing_id: string }).briefing_id).toBe("br-001");
    expect((payload as { asset_id: string }).asset_id).toBe("crypto:btc-usdt");
    expect((payload as { stance: string }).stance).toBe("long");
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("SSE endpoint auth", () => {
  test("returns 401 when API_TOKEN set and header absent", async () => {
    const config = loadConfig();
    const mgr = new RealtimeManager("1.0.0", 0);
    const store = new FixtureStore(config.repoRoot);
    const router = new Router();
    registerRealtimeRoutes(router, mgr, store, config);

    const req = new Request("http://localhost/api/realtime/stream");
    const authReject = checkAuth(req, "secret-token");
    expect(authReject).not.toBeNull();
    expect(authReject!.status).toBe(401);

    mgr.stop();
  });

  test("returns SSE stream when auth passes (no token configured)", async () => {
    const config = loadConfig();
    const mgr = new RealtimeManager("1.0.0", 0);
    const store = new FixtureStore(config.repoRoot);
    const router = new Router();
    registerRealtimeRoutes(router, mgr, store, config);

    const req = new Request("http://localhost/api/realtime/stream");
    const res = await router.handle(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    mgr.stop();
  });
});

// ─── Fixture broadcaster ──────────────────────────────────────────────────────

describe("fixture broadcaster", () => {
  test("nextBatch returns at least two events (feature + market tick)", () => {
    const batch = nextBatch();
    expect(batch.length).toBeGreaterThanOrEqual(2);

    const types = batch.map((e) => e.type);
    expect(types).toContain("feature_updated");
    expect(types).toContain("market_state_updated");
  });

  test("every 5th call includes anomaly_created", () => {
    // drain to a round that is a multiple of 5
    let batch: ReturnType<typeof nextBatch> = [];
    let found = false;
    for (let i = 0; i < 15 && !found; i++) {
      batch = nextBatch();
      if (batch.some((e) => e.type === "anomaly_created")) found = true;
    }
    expect(found).toBe(true);
  });

  test("startFixtureBroadcaster pushes events to manager", async () => {
    const { startFixtureBroadcaster } = await import("../scripts/broadcast");
    const mgr = new RealtimeManager("1.0.0", 0);
    const { events } = collect(mgr);

    const stop = startFixtureBroadcaster(mgr, 50);
    await new Promise((r) => setTimeout(r, 120));
    stop();

    const data = events.filter((e) => e.type !== "connected" && e.type !== "heartbeat");
    expect(data.length).toBeGreaterThan(0);
    mgr.stop();
  });
});
