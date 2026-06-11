/**
 * Publish generated briefings onto the event backbone (P13-T011).
 *
 * Briefings go out on `briefing.generated.<primary_asset>` carrying the
 * `Briefing` contract; the API/UI/notification layers consume them for realtime
 * delivery. The trigger's trace id is propagated so a briefing can be correlated
 * back through its context packet to the anomaly that started the chain. Only
 * validated, stored briefings are published (the service gates on validation,
 * T008) — a briefing is a proposal, never a command (hard rule #3).
 */
import {
  type Briefing,
  BRIEFING_GENERATED,
  Briefing as BriefingSchema,
  PAYLOAD_TYPES,
  subject,
} from "@aestus/contracts";
import type { EventBus } from "@aestus/event-bus";

export interface PublishBriefingOptions {
  /** Canonical asset id used as the subject routing token. */
  asset: string;
  /** Envelope source (service name). */
  source: string;
  /** Trace id to propagate from the context packet, if known. */
  traceId?: string;
}

/** Validate and publish a briefing; returns the subject it went to. */
export async function publishBriefing(
  bus: EventBus,
  briefing: Briefing,
  opts: PublishBriefingOptions,
): Promise<string> {
  const subj = subject(BRIEFING_GENERATED, opts.asset);
  await bus.publish(subj, briefing, BriefingSchema, {
    source: opts.source,
    payload_type: PAYLOAD_TYPES.Briefing,
    ...(opts.traceId !== undefined ? { trace_id: opts.traceId } : {}),
  });
  return subj;
}
