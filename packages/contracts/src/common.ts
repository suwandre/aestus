import { z } from "zod/v4";

/**
 * Shared primitives reused across every contract.
 *
 * Schema versioning is documented in `docs/contracts_versioning.md`. Bump
 * `SCHEMA_VERSION` only for breaking changes to the wire format; every event
 * envelope carries a `schema_version` so consumers can route by version.
 */
export const SCHEMA_VERSION = 1 as const;

/** ISO-8601 / RFC-3339 timestamp string, e.g. `2026-06-07T12:34:56.000Z`. */
export const Timestamp = z.iso.datetime({ offset: true });

/** Opaque non-empty identifier. */
export const Id = z.string().min(1);

/** Schema version stamped on every event envelope. */
export const SchemaVersion = z.number().int().positive();

/** Asset classes Aestus tracks: crypto pairs plus macro proxies. */
export const AssetClass = z.enum([
  "crypto",
  "equity_index",
  "fx",
  "commodity",
  "volatility",
  "rates",
]);
export type AssetClass = z.infer<typeof AssetClass>;
