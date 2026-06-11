import { z } from "zod/v4";

/**
 * Deterministic price levels — the output of the P12 level/risk engine. Per
 * hard rule #2, every number here is computed by code (swing structure, ATR
 * bands, liquidation clusters, S/R) — never invented by the LLM. Shared by the
 * context packet (input) and the briefing (which may only reference / select
 * among these values, never overwrite them).
 */
export const EntryZone = z.object({
  low: z.number(),
  high: z.number(),
});
export type EntryZone = z.infer<typeof EntryZone>;

/**
 * Risk-relative position sizing. A deterministic level-engine output (P12-T009),
 * not an order quantity (hard rule #1): expressed as fraction-of-account risk
 * and/or a derived notional, never a "buy N contracts" instruction. Defined here
 * (with `EntryZone`) so all deterministic risk/level numbers live in one module;
 * `briefing.ts` imports this rather than redefining it.
 */
export const SizeSuggestion = z.object({
  /** Fraction of account to risk on the idea, e.g. 0.01 = 1%. */
  risk_pct: z.number().min(0).max(1).optional(),
  /** Suggested notional in quote currency, derived from risk_pct / stop distance. */
  notional: z.number().nonnegative().optional(),
  note: z.string().optional(),
});
export type SizeSuggestion = z.infer<typeof SizeSuggestion>;

/** Direction the entry/invalidation/target policies were computed for (P12-T006). */
export const LevelDirection = z.enum(["long", "short", "none"]);
export type LevelDirection = z.infer<typeof LevelDirection>;

/** How a derived price level was produced (provenance, for the audit trail). */
export const LevelSource = z.enum([
  "swing_high",
  "swing_low",
  "atr_band",
  "liquidation_cluster",
  "volume_node",
  "pivot",
]);
export type LevelSource = z.infer<typeof LevelSource>;

/** Role a candidate level plays relative to the reference price / thesis. */
export const LevelRole = z.enum(["support", "resistance", "target", "invalidation", "context"]);
export type LevelRole = z.infer<typeof LevelRole>;

/**
 * A single derived price level with provenance + confidence (P12-T003/T004/
 * T005/T008). The flat `supports`/`resistances`/`targets`/`liquidation_clusters`
 * arrays are the selected values for charts and the briefing; `candidates` is
 * the full set with the source/role/confidence behind each one.
 */
export const LevelCandidate = z.object({
  price: z.number(),
  source: LevelSource,
  role: LevelRole,
  /** 0..1 confidence in the level. */
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
});
export type LevelCandidate = z.infer<typeof LevelCandidate>;

/** ATR / volatility-band detail with the formula used, for auditability (P12-T002). */
export const VolatilityBands = z.object({
  /** Average true range over `period` candles. */
  atr: z.number().nonnegative(),
  /** Number of candles the ATR was computed over. */
  period: z.number().int().positive(),
  /** ATR multiplier applied to the reference price for the band width. */
  multiplier: z.number().positive(),
  /** Reference + multiplier·ATR. */
  upper: z.number(),
  /** Reference − multiplier·ATR. */
  lower: z.number(),
  /** Human-readable formula, e.g. `ref ± 1.5·ATR(14)`. */
  formula: z.string(),
});
export type VolatilityBands = z.infer<typeof VolatilityBands>;

/**
 * No-trade assessment (P12-T010): when structure/volatility is too noisy or
 * incomplete to propose a directional trade, the engine emits `is_no_trade`
 * with the reasons and the conditions that would make it re-evaluate.
 */
export const NoTradeCondition = z.object({
  is_no_trade: z.boolean(),
  /** Why a directional trade is not proposed. */
  reasons: z.array(z.string()).default([]),
  /** What would change the assessment (re-check conditions). */
  recheck: z.array(z.string()).default([]),
});
export type NoTradeCondition = z.infer<typeof NoTradeCondition>;

/**
 * One audit-trail entry (P12-T011): a formula, the numeric inputs it consumed,
 * and the value(s) it produced. Lets a user inspect exactly why each numeric
 * level exists, and lets the LLM cite the derivation without re-deriving it.
 */
export const LevelDerivation = z.object({
  /**
   * Which output this explains, e.g. `atr_bands`, `swing_structure`,
   * `support_resistance`, `liquidation_clusters`, `entry_zone`, `invalidation`,
   * `targets`, `size`, `no_trade`.
   */
  component: z.string().min(1),
  /** Human-readable formula / rule applied. */
  method: z.string().min(1),
  /** Named numeric inputs that fed the formula. */
  inputs: z.record(z.string(), z.number()).default({}),
  /** Resulting level value(s). */
  outputs: z.array(z.number()).default([]),
  note: z.string().optional(),
});
export type LevelDerivation = z.infer<typeof LevelDerivation>;

export const DeterministicLevels = z.object({
  /** Reference/last price the levels were computed from. */
  reference_price: z.number(),
  /** Direction the entry/invalidation/target policies were computed for (T006). */
  direction: LevelDirection.default("none"),
  entry_zone: EntryZone,
  /** Price/level at which the thesis is invalidated (stop basis). */
  invalidation: z.number(),
  /** Ordered profit targets (selected values). */
  targets: z.array(z.number()).default([]),
  /** Detected support levels (selected values). */
  supports: z.array(z.number()).default([]),
  /** Detected resistance levels (selected values). */
  resistances: z.array(z.number()).default([]),
  /** Average true range used for band/stop sizing. */
  atr: z.number().nonnegative().optional(),
  /** ATR/volatility band detail + formula (T002). */
  volatility_bands: VolatilityBands.optional(),
  /** Notable liquidation-cluster price levels (selected values). */
  liquidation_clusters: z.array(z.number()).default([]),
  /** Every derived level with source/role/confidence (T003/T004/T005/T008). */
  candidates: z.array(LevelCandidate).default([]),
  /** Risk-relative size guidance (T009); null for no-trade. */
  size_suggestion: SizeSuggestion.nullable().default(null),
  /** No-trade assessment + re-check conditions (T010). */
  no_trade: NoTradeCondition.optional(),
  /** Formula / input / derivation audit trail (T011). */
  derivations: z.array(LevelDerivation).default([]),
  /** How the levels were derived, for a human summary. */
  method_notes: z.string().optional(),
});
export type DeterministicLevels = z.infer<typeof DeterministicLevels>;
