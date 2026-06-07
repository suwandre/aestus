import { z } from "zod/v4";
import { Id, Timestamp } from "./common";

/** Market-impact weighting of a scheduled macro event. */
export const MacroImportance = z.enum(["low", "medium", "high"]);
export type MacroImportance = z.infer<typeof MacroImportance>;

/**
 * A scheduled economic-calendar event (CPI, FOMC, NFP, PPI, jobless claims).
 * `consensus`/`previous`/`actual` are nullable numbers: `actual` is null
 * until the print lands; any field is null when the event has no numeric value.
 */
export const MacroEvent = z.object({
  event_id: Id,
  /** Geographic region, e.g. `US`, `EU`. */
  region: z.string().min(1),
  /** ISO-4217 currency the event most affects, e.g. `USD`. */
  currency: z.string().min(1),
  title: z.string().min(1),
  scheduled_at: Timestamp,
  importance: MacroImportance,
  consensus: z.number().nullable(),
  previous: z.number().nullable(),
  actual: z.number().nullable(),
  /** Data provider / calendar source, e.g. `te`, `forexfactory`. */
  source: z.string().min(1),
});
export type MacroEvent = z.infer<typeof MacroEvent>;
