/**
 * Context packet assembly (P11-T001 skeleton).
 *
 * Turns a trigger `AnomalyEvent` into a schema-valid {@link ContextPacket}.
 * At T001 every data section is a placeholder; subsequent P11 tasks replace
 * each placeholder with a real deterministic query (market snapshot, correlated
 * assets, venues, news, macro, on-chain, analogues). Ids/timestamps are
 * injectable so fixtures and tests stay deterministic.
 */
import {
  type AnomalyEvent,
  type ContextPacket,
  type FeatureSnapshot,
  SCHEMA_VERSION,
} from "@aestus/contracts";
import { placeholderLevels } from "./levels";
import type { ContextDataSource } from "./data/source";

export interface BuildOptions {
  /** Clock for `generated_at`. Defaults to the current time. */
  now?: () => Date;
  /** Packet id from the trigger. Defaults to `ctx:<trigger.id>`. */
  idFor?: (trigger: AnomalyEvent) => string;
  /** Source for market/news/macro/on-chain state; placeholders used if absent. */
  dataSource?: ContextDataSource;
  /** Canonical asset ids to include as correlated-asset context (T003). */
  correlatedAssets?: string[];
}

/** A neutral, schema-valid placeholder snapshot for an asset at a timestamp. */
export function placeholderSnapshot(asset: string, timestamp: string): FeatureSnapshot {
  return {
    schema_version: SCHEMA_VERSION,
    canonical_asset_id: asset,
    timestamp,
    returns: {},
    volatility: {},
    z_scores: {},
    funding_z: null,
    oi_delta: null,
    volume_z: null,
    correlation_set: [],
    basis: [],
    regime: { trend: "ranging", volatility: "normal", risk: "neutral" },
  };
}

/** Assemble a (currently placeholder) context packet for a trigger anomaly. */
export function assembleContextPacket(
  trigger: AnomalyEvent,
  opts: BuildOptions = {},
): ContextPacket {
  const now = opts.now ?? (() => new Date());
  const idFor = opts.idFor ?? ((t) => `ctx:${t.id}`);
  const primaryAsset = trigger.assets[0]!;

  // Current market state for the trigger asset (T002): the real feature
  // snapshot when available, otherwise a neutral placeholder.
  const marketSnapshot =
    opts.dataSource?.featureSnapshot(primaryAsset) ??
    placeholderSnapshot(primaryAsset, trigger.detected_at);

  // Cross-asset context (T003): current snapshots for configured correlated
  // assets (e.g. ETH, SPX, DXY, GOLD, VIX), excluding the primary asset.
  const correlatedAssets =
    opts.dataSource?.correlatedSnapshots(primaryAsset, opts.correlatedAssets ?? []) ?? [];

  return {
    id: idFor(trigger),
    schema_version: SCHEMA_VERSION,
    generated_at: now().toISOString(),
    primary_asset: primaryAsset,
    trigger,
    market_snapshot: marketSnapshot,
    correlated_assets: correlatedAssets,
    news: [],
    macro: [],
    on_chain: [],
    historical_analogues: [],
    deterministic_levels: placeholderLevels(),
  };
}
