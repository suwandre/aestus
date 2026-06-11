/**
 * Briefing validation (P13-T008).
 *
 * A schema-valid briefing can still be unsafe: it might slip into execution
 * language (hard rule #1/#3 — proposals, never commands) or propose a
 * directional idea with no invalidation. This is the semantic gate the service
 * runs before a briefing is stored/published, so a bad output never reaches the
 * user (Done-when). It is pure and reusable — the service decides what to do
 * with a failure (here: skip persist + publish, count it).
 */
import type { Briefing } from "@aestus/contracts";

export interface BriefingValidation {
  ok: boolean;
  /** Human-readable reasons the briefing failed; empty when ok. */
  violations: string[];
}

/**
 * Imperative execution / order-placement phrases a proposal must never contain.
 * Deliberately narrow (command verbs + order/position/leverage instructions) so
 * ordinary analytical language ("a favorable entry", "invalidation below X",
 * "first target") does not trip it.
 */
const EXECUTION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "buy/sell now", re: /\b(buy|sell)\s+now\b/i },
  { label: "go long/short now", re: /\bgo\s+(long|short)\s+now\b/i },
  { label: "order placement", re: /\bplace\s+(an?|the)\s+(order|trade|buy|sell|stop)\b/i },
  { label: "market/limit order", re: /\b(market|limit)\s+order\b/i },
  { label: "execute trade/order", re: /\bexecute\s+(the|this|your)?\s*(trade|order|position)\b/i },
  { label: "open position", re: /\bopen\s+(a|the|your)\s+position\b/i },
  { label: "close position", re: /\bclose\s+(your|the)\s+position\b/i },
  { label: "set a stop", re: /\bset\s+(a|your|the)\s+stop\b/i },
  { label: "leverage instruction", re: /\b\d+\s*x\s+leverage\b/i },
];

/** Return the labels of any forbidden execution phrases found in `text`. */
export function findExecutionLanguage(text: string): string[] {
  return EXECUTION_PATTERNS.filter(({ re }) => re.test(text)).map(({ label }) => label);
}

/** Validate a briefing for safety + completeness. */
export function validateBriefing(b: Briefing): BriefingValidation {
  const violations: string[] = [];

  if (b.stance !== "long" && b.stance !== "short" && b.stance !== "no_trade") {
    violations.push(`invalid stance: ${String(b.stance)}`);
  }
  if (!(b.confidence >= 0 && b.confidence <= 1)) {
    violations.push(`confidence out of range: ${b.confidence}`);
  }
  if (!b.thesis || b.thesis.trim().length === 0) violations.push("empty thesis");
  if (!b.model || b.model.trim().length === 0) violations.push("missing model");

  // A directional idea must carry its invalidation (and entry); a stop-less
  // directional proposal is unsafe by construction.
  if (b.stance === "long" || b.stance === "short") {
    if (b.invalidation === null || b.invalidation === undefined) {
      violations.push("directional briefing missing invalidation");
    }
    if (b.entry_zone === null || b.entry_zone === undefined) {
      violations.push("directional briefing missing entry zone");
    }
  }

  const narrative = [
    b.thesis,
    b.invalidation_reasoning ?? "",
    b.confidence_reasoning ?? "",
    b.recheck_condition ?? "",
    ...b.factors,
  ].join("\n");
  for (const hit of findExecutionLanguage(narrative)) {
    violations.push(`forbidden execution language (${hit})`);
  }

  return { ok: violations.length === 0, violations };
}
