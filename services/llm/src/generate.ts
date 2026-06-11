/**
 * Briefing generation orchestration (P13-T001 skeleton).
 *
 * Flow: context packet → prompt messages → provider completion (structured
 * output) → validated {@link BriefingDraft} → assembled {@link Briefing}. The
 * model contributes stance + narrative + confidence only; entry, invalidation,
 * targets, and sizing are copied verbatim from the packet's deterministic
 * levels (hard rule #2). For a `no_trade` stance the level/size fields are null.
 *
 * Clock and id generator are injectable so tests stay deterministic (mirrors the
 * context service). Validation/repair of the draft is hardened in T008/T006.
 */
import { z } from "zod/v4";
import type { Briefing, ContextPacket } from "@aestus/contracts";
import { BriefingDraft, parseBriefingDraft } from "./draft";
import { buildBriefingMessages } from "./prompt";
import type { LlmCompletion, LlmProvider } from "./provider/types";

/** JSON Schema for the structured-output request (computed once). */
const DRAFT_JSON_SCHEMA = z.toJSONSchema(BriefingDraft, {
  target: "draft-2020-12",
}) as Record<string, unknown>;

export interface GenerateDeps {
  provider: LlmProvider;
  /** Resolved model id for the briefing task (routing added in T004). */
  model: string;
  /** Clock; defaults to the system clock. */
  now?: () => Date;
  /** Briefing id generator; defaults to a random UUID. */
  newId?: (packet: ContextPacket) => string;
}

/** Generate a single briefing from a context packet. */
export async function generateBriefing(
  packet: ContextPacket,
  deps: GenerateDeps,
): Promise<Briefing> {
  const messages = buildBriefingMessages(packet);
  const completion: LlmCompletion = await deps.provider.complete({
    model: deps.model,
    messages,
    responseSchema: DRAFT_JSON_SCHEMA,
    temperature: 0,
  });
  const draft = parseBriefingDraft(completion.content);

  const levels = packet.deterministic_levels;
  const directional = draft.stance === "long" || draft.stance === "short";
  const now = (deps.now ?? (() => new Date()))();
  const id = (deps.newId ?? (() => crypto.randomUUID()))(packet);

  return {
    id,
    schema_version: packet.schema_version,
    context_packet_id: packet.id,
    generated_at: now.toISOString(),
    stance: draft.stance,
    thesis: draft.thesis,
    // Model-authored narrative reasoning (T006 structured output).
    factors: draft.factors,
    invalidation_reasoning: draft.invalidation_reasoning,
    confidence_reasoning: draft.confidence_reasoning,
    recheck_condition: draft.recheck_condition,
    // Deterministic levels copied from the engine; null for no-trade (rule #2).
    entry_zone: directional ? levels.entry_zone : null,
    invalidation: directional ? levels.invalidation : null,
    targets: directional ? levels.targets : [],
    size_suggestion: directional ? levels.size_suggestion : null,
    timeframe: draft.timeframe,
    confidence: draft.confidence,
    model: completion.model,
    supporting_context: [packet.id, packet.trigger.id],
    cost_metadata: {
      provider: completion.provider,
      model: completion.model,
      prompt_tokens: completion.usage.prompt_tokens,
      completion_tokens: completion.usage.completion_tokens,
      total_tokens: completion.usage.total_tokens,
      cost_usd: completion.cost_usd,
    },
  };
}
