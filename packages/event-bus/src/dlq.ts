import { DeadLetter, PAYLOAD_TYPES, SCHEMA_VERSION, deadLetterSubject } from "@aestus/contracts";
import type { EventBus, SubscribeOptions } from "./types";

const decoder = new TextDecoder();

/** Configuration for {@link makeDeadLetterHandler}. */
export interface DeadLetterContext {
  /** Durable consumer / service name recorded on the dead-letter record. */
  consumer: string;
  /** Injectable clock for deterministic tests; defaults to wall-clock. */
  now?: () => string;
  /** Called if publishing the dead-letter itself fails (defaults to console.error). */
  onPublishError?: (error: unknown) => void;
}

/**
 * Build a subscription `onError` handler that routes poison messages to the DLQ
 * (P05-T006). A failed event becomes a `DeadLetter` (original bytes + error
 * metadata) published to `dlq.<original-subject>`, so the source stream is never
 * blocked. Publishing is fire-and-forget — a DLQ failure cannot wedge the
 * consumer either.
 *
 * ```ts
 * await bus.subscribe(subj, RawMarketEvent, handler, {
 *   onError: makeDeadLetterHandler(bus, { consumer: "normalizer" }),
 * });
 * ```
 */
export function makeDeadLetterHandler(
  bus: EventBus,
  ctx: DeadLetterContext,
): NonNullable<SubscribeOptions["onError"]> {
  const clock = ctx.now ?? (() => new Date().toISOString());
  const reportFailure = ctx.onPublishError ?? ((e) => console.error("DLQ publish failed:", e));
  return (error, raw, subject) => {
    const record: DeadLetter = {
      schema_version: SCHEMA_VERSION,
      original_subject: subject,
      consumer: ctx.consumer,
      error_type: error instanceof Error ? error.name : "UnknownError",
      error_message: error instanceof Error ? error.message : String(error),
      failed_at: clock(),
      attempts: 1,
      original_event: decoder.decode(raw),
    };
    void bus
      .publish(deadLetterSubject(subject), record, DeadLetter, {
        source: ctx.consumer,
        payload_type: PAYLOAD_TYPES.DeadLetter,
      })
      .catch(reportFailure);
  };
}
