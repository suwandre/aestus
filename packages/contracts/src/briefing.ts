import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";
import { EntryZone } from "./levels";

/** Directional stance of a briefing. `no_trade` is a first-class outcome. */
export const Stance = z.enum(["long", "short", "no_trade"]);
export type Stance = z.infer<typeof Stance>;

/**
 * Risk-relative position sizing. Numbers are deterministic (hard rule #2) —
 * derived from code using current volatility, never invented by the LLM.
 */
export const SizeSuggestion = z.object({
  /** Fraction of account to risk on the idea, e.g. 0.01 = 1%. */
  risk_pct: z.number().min(0).max(1).optional(),
  /** Suggested notional in quote currency. */
  notional: z.number().nonnegative().optional(),
  note: z.string().optional(),
});
export type SizeSuggestion = z.infer<typeof SizeSuggestion>;

/** Per-briefing LLM cost accounting (hard rule #7 — keep cost visible). */
export const CostMetadata = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
});
export type CostMetadata = z.infer<typeof CostMetadata>;

/**
 * An LLM-authored proposal with reasoning — a proposal, never a command
 * (hard rule #3). Price levels and sizing are copied from the context packet's
 * deterministic levels; the model supplies stance, thesis, confidence, and
 * narrative only. For `no_trade`, the level/size fields are null.
 */
export const Briefing = z.object({
  id: Id,
  schema_version: SchemaVersion,
  /** FK to the `ContextPacket.id` this briefing was generated from. */
  context_packet_id: Id,
  generated_at: Timestamp,
  stance: Stance,
  thesis: z.string().min(1),
  /** Deterministic entry zone; null for `no_trade`. */
  entry_zone: EntryZone.nullable(),
  /** Deterministic invalidation level; null for `no_trade`. */
  invalidation: z.number().nullable(),
  targets: z.array(z.number()).default([]),
  /** Deterministic size suggestion; null for `no_trade`. */
  size_suggestion: SizeSuggestion.nullable(),
  /** Trade horizon, e.g. `intraday`, `swing`, `2-5 days`. */
  timeframe: z.string().min(1),
  /** Model confidence in the thesis, 0..1. */
  confidence: z.number().min(0).max(1),
  /** LLM model id that authored the briefing. */
  model: z.string().min(1),
  /** Refs to the evidence (context packet ids, news ids, anomaly ids) cited. */
  supporting_context: z.array(z.string()).default([]),
  cost_metadata: CostMetadata,
});
export type Briefing = z.infer<typeof Briefing>;
