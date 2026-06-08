import { z } from "zod/v4";
import { EventEnvelope, makeEnvelope } from "@aestus/contracts";
import { ContractValidationError, type PublishOptions } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Validate `payload` against `schema`, wrap it in an envelope (filling
 * ids/timestamps), and encode to bytes ready for the wire. Producer-side
 * validation catches bad payloads before they ever reach a subject.
 */
export function encodeEvent<T>(
  payload: T,
  schema: z.ZodType<T>,
  options: PublishOptions,
): { envelope: EventEnvelope & { payload: T }; bytes: Uint8Array } {
  const parsed = schema.parse(payload);
  // Build the envelope input without ever passing `undefined` for optional
  // fields (exactOptionalPropertyTypes), so the helper's defaults kick in.
  const envelope = makeEnvelope<T>({
    source: options.source,
    payload_type: options.payload_type,
    payload: parsed,
    ...(options.trace_id !== undefined ? { trace_id: options.trace_id } : {}),
    ...(options.event_id !== undefined ? { event_id: options.event_id } : {}),
    ...(options.emitted_at !== undefined ? { emitted_at: options.emitted_at } : {}),
  });
  return { envelope, bytes: encoder.encode(JSON.stringify(envelope)) };
}

/**
 * Decode bytes into an envelope and validate both the envelope shape and its
 * `payload` against `schema`. Throws {@link ContractValidationError} on any
 * mismatch so callers (and the DLQ path) can route poison messages.
 */
export function decodeEvent<T>(
  bytes: Uint8Array,
  schema: z.ZodType<T>,
): { payload: T; envelope: EventEnvelope } {
  let json: unknown;
  try {
    json = JSON.parse(decoder.decode(bytes));
  } catch (cause) {
    throw new ContractValidationError("event is not valid JSON", cause);
  }
  const envelopeResult = EventEnvelope.safeParse(json);
  if (!envelopeResult.success) {
    throw new ContractValidationError("envelope failed validation", envelopeResult.error);
  }
  const payloadResult = schema.safeParse(envelopeResult.data.payload);
  if (!payloadResult.success) {
    throw new ContractValidationError("payload failed contract validation", payloadResult.error);
  }
  return { payload: payloadResult.data, envelope: envelopeResult.data };
}
