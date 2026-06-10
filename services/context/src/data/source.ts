/**
 * Data-source abstraction for context assembly.
 *
 * The context builder reads market/news/macro/on-chain state through this
 * interface so it never touches a concrete store directly. The fixture-backed
 * implementation ({@link ./fixtures.FixtureDataSource}) satisfies it for
 * fixture-first dev/tests (hard rule #5); a live Redis/Postgres/ClickHouse
 * implementation can be added later without changing the builder. Methods are
 * added as P11 tasks need them.
 */
import type { FeatureSnapshot } from "@aestus/contracts";

export interface ContextDataSource {
  /** Latest feature snapshot (current market state) for an asset, if known. */
  featureSnapshot(asset: string): FeatureSnapshot | undefined;
}
