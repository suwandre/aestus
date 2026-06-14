/**
 * RealtimeManager — SSE event broker (P15).
 *
 * Manages active SSE subscriber connections. External code calls `broadcast()`
 * to push a typed UI event to all matching subscribers. A heartbeat interval
 * keeps connections alive and lets clients distinguish a quiet-but-healthy
 * stream from a broken connection.
 *
 * Sequence numbers: global monotonic counter, resets on process restart. The
 * frontend uses seq to detect missed events after a reconnect and re-fetch
 * stale data via REST.
 */
import type {
  AnomalyCreatedEvent,
  BriefingCreatedEvent,
  ConnectedEvent,
  DegradedModeEvent,
  FeatureUpdatedEvent,
  HeartbeatEvent,
  MarketStateUpdatedEvent,
  ReconnectRequiredEvent,
  SourceHealthChangedEvent,
  SubscriptionFilter,
  UIEvent,
} from "@aestus/contracts";

export type { SubscriptionFilter };

// Broadcast payload — everything except `seq` and `ts` which the manager adds.
export type BroadcastPayload =
  | Omit<MarketStateUpdatedEvent, "seq" | "ts">
  | Omit<FeatureUpdatedEvent, "seq" | "ts">
  | Omit<AnomalyCreatedEvent, "seq" | "ts">
  | Omit<BriefingCreatedEvent, "seq" | "ts">
  | Omit<SourceHealthChangedEvent, "seq" | "ts">
  | Omit<DegradedModeEvent, "seq" | "ts">
  | Omit<ReconnectRequiredEvent, "seq" | "ts">;

interface Subscription {
  filter: SubscriptionFilter;
  sink: (event: UIEvent) => void;
}

function matchesFilter(filter: SubscriptionFilter, event: UIEvent): boolean {
  // Lifecycle events always pass through
  const lifecycle = new Set(["connected", "heartbeat", "reconnect_required", "degraded_mode"]);
  if (lifecycle.has(event.type)) return true;

  const { assets, venues } = filter;

  // Asset matching
  if (assets && assets.length > 0) {
    const assetId = "asset_id" in event ? event.asset_id : undefined;
    const eventAssets = "assets" in event ? event.assets : undefined;
    if (assetId && !assets.includes(assetId)) return false;
    if (eventAssets && !eventAssets.some((a) => assets.includes(a))) return false;
  }

  // Venue matching
  if (venues && venues.length > 0) {
    const venue = "venue" in event ? event.venue : undefined;
    const eventVenues = "venues" in event ? event.venues : undefined;
    if (venue !== undefined && !venues.includes(venue)) return false;
    if (eventVenues && !eventVenues.some((v) => venues.includes(v))) return false;
  }

  return true;
}

export class RealtimeManager {
  private subs = new Set<Subscription>();
  private seq = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private readonly version: string;

  constructor(version = "0.1.0", heartbeatIntervalMs = 30_000) {
    this.version = version;
    if (heartbeatIntervalMs > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat();
      }, heartbeatIntervalMs);
    }
  }

  private nextSeq(): number {
    return ++this.seq;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private sendHeartbeat(): void {
    const event: HeartbeatEvent = {
      type: "heartbeat",
      seq: this.nextSeq(),
      ts: this.now(),
    };
    for (const sub of this.subs) {
      try {
        sub.sink(event);
      } catch {
        // Sink closed — will be cleaned up on cancel
      }
    }
  }

  /**
   * Register a new SSE subscriber. Returns an unsubscribe function that must
   * be called when the connection closes (SSE cancel / client disconnect).
   */
  subscribe(filter: SubscriptionFilter, sink: (event: UIEvent) => void): () => void {
    const sub: Subscription = { filter, sink };
    this.subs.add(sub);

    // Send connected event immediately so client knows the current seq baseline
    const connected: ConnectedEvent = {
      type: "connected",
      seq: this.nextSeq(),
      ts: this.now(),
      server_version: this.version,
    };
    try {
      sink(connected);
    } catch {
      this.subs.delete(sub);
    }

    return () => {
      this.subs.delete(sub);
    };
  }

  /** Broadcast a data or lifecycle event to all matching subscribers. */
  broadcast(payload: BroadcastPayload): void {
    const event = { ...payload, seq: this.nextSeq(), ts: this.now() } as UIEvent;
    for (const sub of this.subs) {
      if (matchesFilter(sub.filter, event)) {
        try {
          sub.sink(event);
        } catch {
          // Sink closed — remove stale subscription
          this.subs.delete(sub);
        }
      }
    }
  }

  /**
   * Notify all connected clients that the server is about to restart.
   * Call this in the shutdown handler before stopping the server, so clients
   * can reconnect cleanly rather than retrying on a closed connection.
   */
  notifyReconnectRequired(reason?: string): void {
    const event: ReconnectRequiredEvent = {
      type: "reconnect_required",
      seq: this.nextSeq(),
      ts: this.now(),
      ...(reason !== undefined && { reason }),
    };
    for (const sub of this.subs) {
      try {
        sub.sink(event);
      } catch {
        // Sink closed — will be cleaned up on cancel
      }
    }
  }

  /**
   * Notify all connected clients that one or more data sources have degraded.
   * Also broadcasts a `degraded_mode` UI event so the status cluster can show
   * the correct state without polling /health.
   */
  notifyDegradedMode(sources: string[]): void {
    const event: DegradedModeEvent = {
      type: "degraded_mode",
      seq: this.nextSeq(),
      ts: this.now(),
      sources,
    };
    for (const sub of this.subs) {
      try {
        sub.sink(event);
      } catch {
        // Sink closed — will be cleaned up on cancel
      }
    }
  }

  /** Number of currently active subscriptions. */
  get connectionCount(): number {
    return this.subs.size;
  }

  /** Stop the heartbeat timer (call on server shutdown). */
  stop(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}
