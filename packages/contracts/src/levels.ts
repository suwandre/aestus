import { z } from "zod/v4";

/**
 * Deterministic price levels. Per hard rule #2, every number here is computed
 * by code (swing structure, ATR bands, liquidation clusters, S/R) — never
 * invented by the LLM. Shared by the context packet (input) and the briefing
 * (which may only reference, never overwrite, these values).
 */
export const EntryZone = z.object({
  low: z.number(),
  high: z.number(),
});
export type EntryZone = z.infer<typeof EntryZone>;

export const DeterministicLevels = z.object({
  /** Reference/last price the levels were computed from. */
  reference_price: z.number(),
  entry_zone: EntryZone,
  /** Price/level at which the thesis is invalidated (stop basis). */
  invalidation: z.number(),
  /** Ordered profit targets. */
  targets: z.array(z.number()).default([]),
  /** Detected support levels. */
  supports: z.array(z.number()).default([]),
  /** Detected resistance levels. */
  resistances: z.array(z.number()).default([]),
  /** Average true range used for band/stop sizing. */
  atr: z.number().nonnegative().optional(),
  /** Notable liquidation-cluster price levels. */
  liquidation_clusters: z.array(z.number()).default([]),
  /** How the levels were derived, for auditability. */
  method_notes: z.string().optional(),
});
export type DeterministicLevels = z.infer<typeof DeterministicLevels>;
