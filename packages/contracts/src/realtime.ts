/**
 * UI-facing realtime event types (P15).
 *
 * These are the events the SSE endpoint pushes to the frontend. They are
 * deliberately decoupled from raw NATS subjects so the UI never needs to
 * understand the internal event backbone topology.
 *
 * Every event carries `seq` (global monotonic counter, resets on server
 * restart) and `ts` (ISO-8601 server timestamp) so the client can detect
 * missed or out-of-order events and re-fetch stale data via REST.
 */
import { z } from "zod/v4";

const EventBase = z.object({
  /** Global monotonic sequence number; resets to 0 on server restart. */
  seq: z.number().int().nonnegative(),
  /** Server-side ISO-8601 timestamp when the event was emitted. */
  ts: z.string().min(1),
});

// ─── Lifecycle events ─────────────────────────────────────────────────────────

/** Sent immediately when a client connects (or reconnects). */
export const ConnectedEvent = EventBase.extend({
  type: z.literal("connected"),
  server_version: z.string(),
});
export type ConnectedEvent = z.infer<typeof ConnectedEvent>;

/** Sent on a regular interval (~30 s) to distinguish quiet from broken. */
export const HeartbeatEvent = EventBase.extend({
  type: z.literal("heartbeat"),
});
export type HeartbeatEvent = z.infer<typeof HeartbeatEvent>;

/** Sent before a planned server restart; client should reconnect after ~5 s. */
export const ReconnectRequiredEvent = EventBase.extend({
  type: z.literal("reconnect_required"),
  reason: z.string().optional(),
});
export type ReconnectRequiredEvent = z.infer<typeof ReconnectRequiredEvent>;

/** Sent when one or more data sources transition to degraded/down. */
export const DegradedModeEvent = EventBase.extend({
  type: z.literal("degraded_mode"),
  /** Source IDs that are degraded, e.g. `["nats", "feed:binance"]`. */
  sources: z.array(z.string()),
});
export type DegradedModeEvent = z.infer<typeof DegradedModeEvent>;

// ─── Data events ─────────────────────────────────────────────────────────────

/** Emitted when a normalized market tick arrives for an asset/venue pair. */
export const MarketStateUpdatedEvent = EventBase.extend({
  type: z.literal("market_state_updated"),
  asset_id: z.string().min(1),
  venue: z.string().optional(),
  price: z.number().optional(),
  change_pct_24h: z.number().optional(),
});
export type MarketStateUpdatedEvent = z.infer<typeof MarketStateUpdatedEvent>;

/** Emitted when the feature engine publishes a new snapshot for an asset. */
export const FeatureUpdatedEvent = EventBase.extend({
  type: z.literal("feature_updated"),
  asset_id: z.string().min(1),
  regime: z
    .object({
      trend: z.string(),
      volatility: z.string(),
      risk: z.string(),
    })
    .optional(),
  funding_z: z.number().nullable().optional(),
});
export type FeatureUpdatedEvent = z.infer<typeof FeatureUpdatedEvent>;

/** Emitted when a new anomaly is detected. */
export const AnomalyCreatedEvent = EventBase.extend({
  type: z.literal("anomaly_created"),
  anomaly_id: z.string().min(1),
  anomaly_type: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  assets: z.array(z.string()),
  venues: z.array(z.string()),
  title: z.string().min(1),
});
export type AnomalyCreatedEvent = z.infer<typeof AnomalyCreatedEvent>;

/** Emitted when a new briefing is ready for the user to review. */
export const BriefingCreatedEvent = EventBase.extend({
  type: z.literal("briefing_created"),
  briefing_id: z.string().min(1),
  asset_id: z.string().optional(),
  stance: z.string().optional(),
});
export type BriefingCreatedEvent = z.infer<typeof BriefingCreatedEvent>;

/** Emitted when a data feed changes health status. */
export const SourceHealthChangedEvent = EventBase.extend({
  type: z.literal("source_health_changed"),
  source_id: z.string().min(1),
  status: z.enum(["ok", "degraded", "down"]),
  detail: z.string().optional(),
});
export type SourceHealthChangedEvent = z.infer<typeof SourceHealthChangedEvent>;

// ─── Union ────────────────────────────────────────────────────────────────────

export const UIEvent = z.discriminatedUnion("type", [
  ConnectedEvent,
  HeartbeatEvent,
  ReconnectRequiredEvent,
  DegradedModeEvent,
  MarketStateUpdatedEvent,
  FeatureUpdatedEvent,
  AnomalyCreatedEvent,
  BriefingCreatedEvent,
  SourceHealthChangedEvent,
]);
export type UIEvent = z.infer<typeof UIEvent>;

/** Subscription filter applied server-side to reduce client update volume. */
export interface SubscriptionFilter {
  /** Only deliver events for assets in this list. Empty = all assets. */
  assets?: string[];
  /** Only deliver events for venues in this list. Empty = all venues. */
  venues?: string[];
  /** Hint for tab-specific optimization (unused in MVP filtering logic). */
  tab?: string;
}
