/**
 * Structured model-output schema — the briefing "draft" (P13-T001 skeleton;
 * full field set + safe repair in T006).
 *
 * This is an internal orchestration contract, not a wire contract: the model
 * returns a draft (narrative + stance + confidence only), and the service
 * assembles the persisted/published {@link Briefing} by copying the packet's
 * deterministic levels onto it (hard rule #2). Only the final `Briefing` leaves
 * the service. Keeping the draft narrow means the model literally cannot emit a
 * price level.
 */
import { z } from "zod/v4";
import { Stance } from "@aestus/contracts";

export const BriefingDraft = z.object({
  stance: Stance,
  thesis: z.string().min(1),
  /** Model confidence in the thesis, 0..1. */
  confidence: z.number().min(0).max(1),
  /** Trade horizon, e.g. `intraday`, `swing`, `until re-check`. */
  timeframe: z.string().min(1),
});
export type BriefingDraft = z.infer<typeof BriefingDraft>;
