import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";

/** User action on a briefing (hard rule #4 — every decision is logged). */
export const DecisionType = z.enum(["act", "skip", "snooze", "dismiss", "watch"]);
export type DecisionType = z.infer<typeof DecisionType>;

/**
 * A logged user decision on a briefing, with its informing context
 * (hard rule #4). Plan fields (entry/stop/targets/risk_r) are populated when
 * the user chooses `act`; they are null/empty for skip/snooze/dismiss/watch.
 * Aestus never executes these — they record intent only (hard rule #1).
 */
export const Decision = z.object({
  id: Id,
  schema_version: SchemaVersion,
  /** FK to the `Briefing.id` this decision responds to. */
  briefing_id: Id,
  decision_type: DecisionType,
  /** Free-text reasoning the user gave. */
  rationale: z.string().optional(),
  /** Planned entry price (act only). */
  planned_entry: z.number().nullable(),
  /** Planned stop price (act only). */
  planned_stop: z.number().nullable(),
  planned_targets: z.array(z.number()).default([]),
  /** Planned reward-to-risk in R multiples (act only). */
  risk_r: z.number().nullable(),
  /** When to resurface a snoozed briefing. */
  snooze_until: Timestamp.optional(),
  tags: z.array(z.string()).default([]),
  decided_at: Timestamp,
});
export type Decision = z.infer<typeof Decision>;
