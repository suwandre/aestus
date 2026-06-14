/**
 * Fixture broadcaster (P15-T007).
 *
 * Dev tool: connects to the running API server's SSE endpoint to verify it is
 * reachable, then calls the internal broadcast HTTP endpoint to push fixture
 * events at realistic intervals so the frontend can be developed with
 * live-feeling fake data without a live NATS/market-data connection.
 *
 * Usage:
 *   bun run apps/api/scripts/broadcast.ts
 *
 * Env:
 *   API_URL   — base URL of the running API server (default: http://localhost:8090)
 *   API_TOKEN — bearer token if auth is enabled (default: unset)
 *   INTERVAL  — ms between broadcast rounds (default: 3000)
 *
 * The broadcaster POSTs to POST /api/realtime/broadcast (registered when
 * FIXTURE_BROADCASTER=1 is set in the server environment). In dev, start the
 * server with FIXTURE_BROADCASTER=1 to enable the internal broadcast endpoint.
 *
 * Standalone mode (no running server): import FixtureBroadcaster and pass a
 * RealtimeManager directly from within the server process.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AnomalyEvent, Briefing, FeatureSnapshot, VenueQuote } from "@aestus/contracts";
import type { BroadcastPayload } from "../src/realtime";
import {
  mapAnomalyEvent,
  mapBriefing,
  mapFeatureSnapshot,
  mapPriceTick,
} from "../src/event-mapper";

// ─── Config ───────────────────────────────────────────────────────────────────

const API_URL = process.env.API_URL ?? "http://localhost:8090";
const API_TOKEN = process.env.API_TOKEN ?? "";
const INTERVAL_MS = Number.parseInt(process.env.INTERVAL ?? "3000", 10);

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

function loadFixture<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, "fixtures", relPath), "utf8")) as T;
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

const snapshots = loadFixture<FeatureSnapshot[]>("features/snapshots.json");
const venueQuotes = loadFixture<VenueQuote[]>("market/venue_quotes.json");
const anomalies = loadFixture<AnomalyEvent[]>("anomalies/events.json");
const briefings = loadFixture<Briefing[]>("briefings/briefings.json");

// ─── Round-robin state ────────────────────────────────────────────────────────

let snapshotIdx = 0;
let quoteIdx = 0;
let anomalyIdx = 0;
let briefingIdx = 0;
let round = 0;

/**
 * Produce the next batch of broadcast payloads.
 *
 * Rotates through fixture items so the UI sees a stream of varied updates
 * rather than the same item repeating.
 */
export function nextBatch(): BroadcastPayload[] {
  const batch: BroadcastPayload[] = [];

  // Every round: a feature snapshot + venue quote
  const snap = snapshots[snapshotIdx % snapshots.length]!;
  snapshotIdx++;
  batch.push(mapFeatureSnapshot(snap));

  const quote = venueQuotes[quoteIdx % venueQuotes.length]!;
  quoteIdx++;
  batch.push(
    mapPriceTick({
      canonical_asset_id: snap.canonical_asset_id,
      venue: quote.venue,
      price: quote.price,
      change_pct_24h: snap.returns["24h"],
    }),
  );

  // Every 5 rounds: an anomaly event
  if (round % 5 === 0 && anomalies.length > 0) {
    const anomaly = anomalies[anomalyIdx % anomalies.length]!;
    anomalyIdx++;
    batch.push(mapAnomalyEvent(anomaly));
  }

  // Every 10 rounds: a briefing created event
  if (round % 10 === 0 && briefings.length > 0) {
    const briefing = briefings[briefingIdx % briefings.length]!;
    briefingIdx++;
    batch.push(mapBriefing(briefing));
  }

  round++;
  return batch;
}

// ─── In-process broadcaster (for server integration) ─────────────────────────

import type { RealtimeManager } from "../src/realtime";

/**
 * Start an in-process fixture broadcaster that pushes to a RealtimeManager
 * directly. Returns a stop function.
 *
 * Use this from within the server process by calling:
 *   const stop = startFixtureBroadcaster(realtimeManager);
 */
export function startFixtureBroadcaster(
  manager: RealtimeManager,
  intervalMs = INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    for (const payload of nextBatch()) {
      manager.broadcast(payload);
    }
  }, intervalMs);
  console.log(`[broadcast] fixture broadcaster started (interval=${intervalMs}ms)`);
  return () => {
    clearInterval(timer);
    console.log("[broadcast] fixture broadcaster stopped");
  };
}

// ─── Standalone HTTP mode (when run as a script) ─────────────────────────────

async function postBroadcast(payload: BroadcastPayload): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (API_TOKEN) headers["authorization"] = `Bearer ${API_TOKEN}`;
  const res = await fetch(`${API_URL}/api/realtime/broadcast`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.warn(`[broadcast] POST failed: ${res.status} ${await res.text()}`);
  }
}

async function runHttpMode(): Promise<void> {
  console.log(`[broadcast] HTTP mode — targeting ${API_URL} (interval=${INTERVAL_MS}ms)`);
  console.log("[broadcast] Press Ctrl+C to stop");

  // Verify SSE endpoint is reachable
  const headers: Record<string, string> = {};
  if (API_TOKEN) headers["authorization"] = `Bearer ${API_TOKEN}`;
  try {
    const probe = await fetch(`${API_URL}/health`);
    if (!probe.ok) {
      console.error(`[broadcast] API health check failed: ${probe.status}`);
      process.exit(1);
    }
    console.log("[broadcast] API reachable, starting broadcast loop");
  } catch (err) {
    console.error(`[broadcast] Cannot reach API at ${API_URL}:`, err);
    process.exit(1);
  }

  setInterval(async () => {
    for (const payload of nextBatch()) {
      await postBroadcast(payload);
    }
  }, INTERVAL_MS);
}

// Run when invoked directly (not imported)
if (import.meta.main) {
  runHttpMode().catch(console.error);
}
