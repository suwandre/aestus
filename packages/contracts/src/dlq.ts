import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";

/**
 * Dead-letter record (P05-T006). When a consumer cannot handle an event
 * (decode failure, contract-validation failure, or a throwing handler) it
 * routes the event here instead of blocking its source stream. The original
 * event is kept verbatim as a UTF-8 string so even non-JSON / invalid-envelope
 * poison messages survive for inspection and replay.
 */
export const DeadLetter = z.object({
  schema_version: SchemaVersion,
  /** The subject the original event was received on. */
  original_subject: z.string().min(1),
  /** Durable consumer / service that failed to handle it. */
  consumer: Id,
  /** Error class name, e.g. `ContractValidationError`. */
  error_type: z.string().min(1),
  /** Human-readable error message. */
  error_message: z.string(),
  /** When the failure was recorded. */
  failed_at: Timestamp,
  /** Delivery attempts before dead-lettering. */
  attempts: z.number().int().positive().default(1),
  /** The original event bytes, decoded as UTF-8 (verbatim, may not be JSON). */
  original_event: z.string(),
});
export type DeadLetter = z.infer<typeof DeadLetter>;
