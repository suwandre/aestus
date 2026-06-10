/**
 * Publish assembled context packets onto the event backbone (P11-T001).
 *
 * Packets go out on `context.packet.<primary_asset>` carrying the
 * `ContextPacket` contract; the LLM orchestration layer (P13) consumes them
 * asynchronously. The trigger's trace id is propagated so a briefing can be
 * correlated back to the anomaly that started the chain.
 */
import {
  type ContextPacket,
  CONTEXT_PACKET,
  ContextPacket as ContextPacketSchema,
  PAYLOAD_TYPES,
  subject,
} from "@aestus/contracts";
import type { EventBus } from "@aestus/event-bus";

export interface PublishContextOptions {
  /** Envelope source (service name). */
  source: string;
  /** Trace id to propagate from the trigger anomaly, if known. */
  traceId?: string;
}

/** Validate and publish a context packet; returns the subject it went to. */
export async function publishContextPacket(
  bus: EventBus,
  packet: ContextPacket,
  opts: PublishContextOptions,
): Promise<string> {
  const subj = subject(CONTEXT_PACKET, packet.primary_asset);
  await bus.publish(subj, packet, ContextPacketSchema, {
    source: opts.source,
    payload_type: PAYLOAD_TYPES.ContextPacket,
    ...(opts.traceId !== undefined ? { trace_id: opts.traceId } : {}),
  });
  return subj;
}
