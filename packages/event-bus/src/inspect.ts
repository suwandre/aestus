import { EventEnvelope } from "@aestus/contracts";

/**
 * Helpers for the event-inspection CLI (P05-T008): decode an envelope off the
 * wire and pretty-print it. Kept in `src/` (vs the script) so the formatting is
 * unit-tested.
 */

const decoder = new TextDecoder();

export type DecodedEnvelope =
  | { ok: true; envelope: EventEnvelope }
  | { ok: false; error: unknown; raw: string };

/** Decode raw bytes into an `EventEnvelope`, or return the raw text on failure. */
export function decodeEnvelopeBytes(bytes: Uint8Array): DecodedEnvelope {
  const raw = decoder.decode(bytes);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error, raw };
  }
  const result = EventEnvelope.safeParse(json);
  if (!result.success) return { ok: false, error: result.error, raw };
  return { ok: true, envelope: result.data };
}

/** Pretty-print an envelope received on `subject` as a header line + indented payload. */
export function formatEnvelope(subject: string, envelope: EventEnvelope): string {
  const head =
    `${envelope.emitted_at}  ${subject}  ` +
    `${envelope.source} → ${envelope.payload_type}  ` +
    `[${envelope.event_id} trace=${envelope.trace_id} v${envelope.schema_version}]`;
  const body = JSON.stringify(envelope.payload, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `${head}\n${body}`;
}

/** Format whatever was decoded — envelope if valid, else a flagged raw dump. */
export function formatDecoded(subject: string, decoded: DecodedEnvelope): string {
  if (decoded.ok) return formatEnvelope(subject, decoded.envelope);
  return `${subject}  [UNDECODABLE ENVELOPE]\n  ${decoded.raw}`;
}
