/**
 * Backend-to-UI event mapper (P15-T003).
 *
 * Translates internal NATS event types into UI-facing UIEvent broadcast
 * payloads. The frontend never needs to understand NATS subjects or the
 * internal event bus topology — only the types exported from contracts/realtime.
 *
 * These functions return `BroadcastPayload` (UIEvent minus seq/ts), which the
 * RealtimeManager stamps with sequence number and timestamp before delivering.
 */
import type { AnomalyEvent, Briefing, DependencyHealth, FeatureSnapshot } from "@aestus/contracts";
import type { BroadcastPayload } from "./realtime";

/** NormalizedMarketEvent price_tick shape (minimal fields used for mapping). */
export interface PriceTick {
  canonical_asset_id: string;
  venue: string;
  price: number;
  /** 24h return from the accompanying FeatureSnapshot if available. */
  change_pct_24h?: number;
}

/** Map a normalized price tick to a market_state_updated UI event. */
export function mapPriceTick(tick: PriceTick): BroadcastPayload {
  return {
    type: "market_state_updated",
    asset_id: tick.canonical_asset_id,
    venue: tick.venue,
    price: tick.price,
    ...(tick.change_pct_24h !== undefined && { change_pct_24h: tick.change_pct_24h }),
  };
}

/** Map a FeatureSnapshot to a feature_updated UI event. */
export function mapFeatureSnapshot(snap: FeatureSnapshot): BroadcastPayload {
  return {
    type: "feature_updated",
    asset_id: snap.canonical_asset_id,
    regime: snap.regime,
    funding_z: snap.funding_z,
  };
}

/** Map an AnomalyEvent to an anomaly_created UI event. */
export function mapAnomalyEvent(anomaly: AnomalyEvent): BroadcastPayload {
  return {
    type: "anomaly_created",
    anomaly_id: anomaly.id,
    anomaly_type: anomaly.type,
    severity: anomaly.severity,
    assets: anomaly.assets,
    venues: anomaly.venues,
    title: anomaly.title,
  };
}

/**
 * Map a Briefing to a briefing_created UI event.
 *
 * `assetId` must be passed separately because it lives on the ContextPacket
 * (briefing.context_packet_id → ContextPacket.primary_asset), not on the
 * Briefing itself. Callers that don't have the context packet can omit it.
 */
export function mapBriefing(briefing: Briefing, assetId?: string): BroadcastPayload {
  const payload: {
    type: "briefing_created";
    briefing_id: string;
    stance: string;
    asset_id?: string;
  } = {
    type: "briefing_created",
    briefing_id: briefing.id,
    stance: briefing.stance,
  };
  if (assetId) payload.asset_id = assetId;
  return payload as BroadcastPayload;
}

/**
 * Map a dependency health list to zero or more source_health_changed UI events.
 *
 * Returns one event per dependency whose status is not "ok". Callers should
 * broadcast each item.
 */
export function mapDependencyHealth(deps: DependencyHealth[]): BroadcastPayload[] {
  return deps
    .filter((d) => d.status !== "ok")
    .map((d) => ({
      type: "source_health_changed" as const,
      source_id: d.name,
      status: d.status as "ok" | "degraded" | "down",
      detail: d.detail,
    }));
}
