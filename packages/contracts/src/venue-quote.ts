import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";

/**
 * Per-venue market quote for one canonical asset (P11-T004). The context
 * service collects these across venues to judge whether a dislocation is
 * venue-specific (one venue diverging) or market-wide (venues aligned).
 * `funding_rate`/`open_interest`/`basis_bps` are nullable: spot-only or macro
 * venues don't have funding/OI, and basis is null when there's no reference.
 */
export const VenueQuote = z.object({
  schema_version: SchemaVersion,
  /** FK to `Venue.venue_id`. */
  venue: Id,
  /** FK to `AssetIdentity.canonical_id`. */
  canonical_asset_id: Id,
  timestamp: Timestamp,
  /** Mark/last price on this venue. */
  price: z.number(),
  /** Funding rate (per-interval fraction); null when the venue has no funding. */
  funding_rate: z.number().nullable(),
  /** Open interest in base-asset units; null when not applicable. */
  open_interest: z.number().nonnegative().nullable(),
  /** Basis vs spot/index in basis points; null when no reference. */
  basis_bps: z.number().nullable(),
});
export type VenueQuote = z.infer<typeof VenueQuote>;
