import { z } from "zod/v4";
import { Id, Timestamp } from "./common";

/** Anomaly taxonomy (spec §117). */
export const AnomalyType = z.enum([
  "funding_spike",
  "oi_surge",
  "volume_anomaly",
  "correlation_break",
  "basis_dislocation",
  "whale_flow",
  "macro_approaching",
]);
export type AnomalyType = z.infer<typeof AnomalyType>;

export const AnomalySeverity = z.enum(["low", "medium", "high", "critical"]);
export type AnomalySeverity = z.infer<typeof AnomalySeverity>;

/** Lifecycle state of an anomaly in the cockpit. */
export const AnomalyStatus = z.enum(["active", "acknowledged", "resolved", "expired", "dismissed"]);
export type AnomalyStatus = z.infer<typeof AnomalyStatus>;

/**
 * A deterministic anomaly emitted by the feature/anomaly engine (spec §100).
 * `sigma` is nullable because some types (e.g. `macro_approaching`) are
 * schedule-driven rather than statistical. `context_refs` point to the events
 * or snapshots that justify the anomaly; `rule_ref` names the firing rule.
 */
export const AnomalyEvent = z.object({
  id: Id,
  type: AnomalyType,
  severity: AnomalySeverity,
  /** Statistical magnitude in standard deviations; null for non-statistical types. */
  sigma: z.number().nullable(),
  /** FKs to `AssetIdentity.canonical_id`. */
  assets: z.array(Id).min(1),
  /** FKs to `Venue.venue_id`; may be empty for cross-asset/macro anomalies. */
  venues: z.array(Id).default([]),
  title: z.string().min(1),
  description: z.string().min(1),
  detected_at: Timestamp,
  status: AnomalyStatus,
  /** References to supporting events/snapshots/context packets. */
  context_refs: z.array(z.string()).default([]),
  /** Id of the detection rule that fired, if rule-based. */
  rule_ref: Id.optional(),
});
export type AnomalyEvent = z.infer<typeof AnomalyEvent>;
