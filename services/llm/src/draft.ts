/**
 * Structured model-output schema — the briefing "draft" (P13-T006).
 *
 * This is an internal orchestration contract, not a wire contract: the model
 * returns a draft (narrative + stance + confidence only), and the service
 * assembles the persisted/published {@link Briefing} by copying the packet's
 * deterministic levels onto it (hard rule #2). Only the final `Briefing` leaves
 * the service. Keeping the draft narrow means the model literally cannot emit a
 * price level.
 *
 * {@link parseBriefingDraft} enforces the schema on raw model output: conformant
 * output passes; malformed-but-recoverable output is repaired safely (clamped
 * confidence, defaulted narrative, filtered factors); output missing an
 * essential field (stance / thesis) is rejected (Done-when).
 */
import { z } from "zod/v4";
import { Stance } from "@aestus/contracts";

export const BriefingDraft = z.object({
  stance: Stance,
  thesis: z.string().min(1),
  /** Key drivers behind the stance, each ideally citing a context section. */
  factors: z.array(z.string()).default([]),
  /** Why the (engine-supplied) invalidation level matters. */
  invalidation_reasoning: z.string().default(""),
  /** Why this confidence level, tied to data quality. */
  confidence_reasoning: z.string().default(""),
  /** What would change the assessment (especially for no_trade). */
  recheck_condition: z.string().default(""),
  /** Model confidence in the thesis, 0..1. */
  confidence: z.number().min(0).max(1),
  /** Trade horizon, e.g. `intraday`, `swing`, `until re-check`. */
  timeframe: z.string().min(1),
});
export type BriefingDraft = z.infer<typeof BriefingDraft>;

/** Raised when model output cannot be coerced into a valid draft. */
export class InvalidBriefingDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBriefingDraftError";
  }
}

/** Extract the first JSON object from raw model text (tolerates fences/prose). */
export function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new InvalidBriefingDraftError("no JSON object found in model output");
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    throw new InvalidBriefingDraftError(`model output is not valid JSON: ${String(e)}`);
  }
}

/** Coerce/default the recoverable fields; leave stance/thesis for re-validation. */
function repairDraft(obj: unknown): Record<string, unknown> {
  const o = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
  const conf = Number(o.confidence);
  const asString = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    stance: o.stance,
    thesis:
      typeof o.thesis === "string" ? o.thesis : o.thesis != null ? String(o.thesis) : undefined,
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
    timeframe:
      typeof o.timeframe === "string" && o.timeframe.length > 0 ? o.timeframe : "unspecified",
    factors: Array.isArray(o.factors)
      ? o.factors.filter((x): x is string => typeof x === "string")
      : [],
    invalidation_reasoning: asString(o.invalidation_reasoning),
    confidence_reasoning: asString(o.confidence_reasoning),
    recheck_condition: asString(o.recheck_condition),
  };
}

/** Parse raw model output into a valid {@link BriefingDraft}, repairing or rejecting. */
export function parseBriefingDraft(raw: string): BriefingDraft {
  const obj = extractJsonObject(raw);
  const direct = BriefingDraft.safeParse(obj);
  if (direct.success) return direct.data;
  const repaired = BriefingDraft.safeParse(repairDraft(obj));
  if (repaired.success) return repaired.data;
  throw new InvalidBriefingDraftError(`unrepairable model output: ${repaired.error.message}`);
}
