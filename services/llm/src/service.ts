/**
 * LLM orchestration runtime (P13-T001 skeleton).
 *
 * The job-queue consumer: subscribes to `context.packet.>`, generates a
 * briefing for each packet, and persists it. The event backbone IS the job
 * queue here (the context service emits one packet per anomaly for the LLM
 * layer to consume asynchronously) — consistent with every other service and
 * avoiding a second broker. Decode/validation/handler failures are logged and
 * counted, never thrown, so one poison packet can't kill the consumer.
 *
 * Persistence happens before publish (added in T011) so a briefing is always
 * retrievable even if a later step fails. Cost is metered per call (hard rule
 * #7). Publish (T011) and cache policy (T012) layer onto this loop.
 */
import {
  CONTEXT_PACKET,
  type ContextPacket,
  ContextPacket as ContextPacketSchema,
} from "@aestus/contracts";
import type { EventBus, Subscription } from "@aestus/event-bus";
import type { Briefing } from "@aestus/contracts";
import type { LlmConfig } from "./config";
import type { LlmMetrics } from "./health";
import type { LlmProvider } from "./provider/types";
import { generateBriefing } from "./generate";
import type { BriefingStore } from "./store";

export interface LlmServiceDeps {
  bus: EventBus;
  config: LlmConfig;
  metrics: LlmMetrics;
  provider: LlmProvider;
  store: BriefingStore;
  /** Resolved model id for the briefing task (routing added in T004). */
  model: string;
  /** Clock injected into generation. */
  now?: () => Date;
}

/** Generate, meter, and persist one briefing for a packet; returns it. */
export async function processPacket(
  packet: ContextPacket,
  deps: LlmServiceDeps,
): Promise<Briefing> {
  const briefing = await generateBriefing(packet, {
    provider: deps.provider,
    model: deps.model,
    ...(deps.now !== undefined ? { now: deps.now } : {}),
  });
  deps.metrics.llmCalls += 1;
  deps.metrics.promptTokens += briefing.cost_metadata.prompt_tokens;
  deps.metrics.completionTokens += briefing.cost_metadata.completion_tokens;
  deps.metrics.costUsd += briefing.cost_metadata.cost_usd;
  await deps.store.save(briefing);
  deps.metrics.briefingsGenerated += 1;
  return briefing;
}

/**
 * Start consuming context packets. Returns the subscription; call
 * `unsubscribe()` to stop.
 */
export async function startLlmService(deps: LlmServiceDeps): Promise<Subscription> {
  return deps.bus.subscribe(
    `${CONTEXT_PACKET.base}.>`,
    ContextPacketSchema,
    async (packet, envelope) => {
      deps.metrics.lastPacketEpochMs =
        Date.parse(envelope.emitted_at) || deps.metrics.lastPacketEpochMs;
      try {
        await processPacket(packet, deps);
      } catch (err) {
        deps.metrics.errors += 1;
        console.error(`[llm] failed to generate briefing for ${packet.id}:`, err);
      }
    },
    {
      onError: (error, _raw, subj) => {
        deps.metrics.errors += 1;
        console.error(`[llm] bad context packet on ${subj}:`, error);
      },
    },
  );
}
