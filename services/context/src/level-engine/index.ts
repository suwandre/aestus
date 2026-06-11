/**
 * Deterministic level/risk engine (P12).
 *
 * Public surface: the {@link computeLevels} entry point and the input types.
 * The engine is pure deterministic math over market data and carries no LLM
 * code (hard rule #2). Its output is the shared `DeterministicLevels` contract.
 */
export * from "./types";
export {
  computeLevels,
  resolveConfig,
  resolveReferencePrice,
  resolveDirection,
  tradeDirection,
  DEFAULT_LEVEL_CONFIG,
} from "./engine";
export { trueRanges, averageTrueRange, computeVolatilityBands } from "./atr";
export { detectSwings, computeSwingStructure } from "./swing";
export { computeLiquidationLevels } from "./liquidation";
export { computeVolumeNodes } from "./support-resistance";
export { computeEntryZone } from "./entry";
export { computeInvalidation } from "./invalidation";
export { computeTargets } from "./target";
export { computeSizeSuggestion } from "./size";
export { evaluateNoTrade } from "./no-trade";
export { projectStructure } from "./engine";
