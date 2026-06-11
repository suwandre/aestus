/**
 * Level engine input types (P12-T001).
 *
 * The deterministic level/risk engine takes market data (OHLCV candles,
 * liquidation clusters, a reference price) and produces a {@link
 * DeterministicLevels} output (the shared contract). These input types are
 * local to the engine — they are *inputs*, not a cross-service contract — and
 * are intentionally independent of any LLM code (hard rule #2): nothing here
 * imports a model, prompt, or briefing.
 *
 * A candle mirrors the feature engine's OHLCV concept (services/features
 * `candle.rs`); it is duplicated as a plain TS shape rather than promoted to a
 * shared contract until a live (non-fixture) source needs it.
 */

/** One OHLCV candle for a single timeframe bucket. */
export interface Candle {
  /** Bucket open time, ISO-8601. Candles are ordered oldest→newest by array position. */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * A liquidation cluster: notional liquidations bucketed by a price band and
 * side. Matches the feature engine's `liq_clusters` shape (carried as an extra
 * field on the features fixture, see progress P11-T002).
 */
export interface LiquidationCluster {
  /** Lower bound of the price band. */
  price_low: number;
  /** Upper bound of the price band. */
  price_high: number;
  /** Total liquidated size/notional in the band. */
  total_size: number;
  /** Side being liquidated. */
  side: "buy" | "sell";
}

/** Trade direction the engine computes entry/invalidation/target policies for. */
export type TradeDirection = "long" | "short";

/**
 * Tuning knobs for the deterministic level engine. All have sane defaults
 * ({@link DEFAULT_LEVEL_CONFIG}); a caller overrides only what it needs. Every
 * value here is a fixed parameter — changing it changes the formula, not the
 * data, so outputs stay deterministic for a given input + config.
 */
export interface LevelEngineConfig {
  /** Candles used for the ATR average (T002). */
  atrPeriod: number;
  /** ATR multiplier for the volatility band width (T002). */
  atrMultiplier: number;
  /** Pivot strength: a swing high/low must exceed this many neighbours each side (T003). */
  swingStrength: number;
  /** Most recent candles scanned for swing structure / S-R (T003/T005). */
  swingLookback: number;
  /** Two levels within this fraction of price are merged into one S/R node (T005). */
  srTolerancePct: number;
  /** A candle whose volume is ≥ this × mean volume is a high-volume S/R node (T005). */
  volumeNodeFactor: number;
  /** ATR fraction defining the entry-zone half-width around the trigger price (T006). */
  entryAtrFraction: number;
  /** ATR multiples used to project targets when structure is absent (T008). */
  targetAtrMultiples: number[];
  /** Max fraction of account to risk on one idea (T009). */
  maxRiskPct: number;
  /** Fewer candles than this → insufficient data → no-trade (T010). */
  minCandles: number;
  /** ATR/price above this fraction is "too noisy" → no-trade (T010). */
  noiseAtrPctThreshold: number;
}

/** Input to the level engine for one asset at one point in time. */
export interface LevelEngineInput {
  /** Canonical asset id the levels are for. */
  asset: string;
  /** Recent OHLCV candles, oldest→newest, single timeframe. */
  candles: Candle[];
  /** Known liquidation clusters (e.g. from the feature engine); optional. */
  liquidationClusters?: LiquidationCluster[];
  /** Reference/last price; defaults to the last candle close. */
  referencePrice?: number;
  /** Trade direction; if omitted, inferred from `regimeTrend`. */
  direction?: TradeDirection;
  /** Regime trend label (from `FeatureSnapshot.regime.trend`), used to infer direction. */
  regimeTrend?: string;
  /** Config overrides; defaults applied for anything omitted. */
  config?: Partial<LevelEngineConfig>;
}
