/**
 * Deterministic fake LLM provider (P13-T001 skeleton; hardened in T003).
 *
 * Backs fixture-first dev and tests (hard rule #5): the briefing pipeline runs
 * end-to-end with no `OLLAMA_API_KEY` and no network. Output is a pure function
 * of the prompt — no clock, no RNG — so tests can assert exact briefings.
 *
 * When a structured-output request carries the packet facts block that
 * {@link buildBriefingMessages} embeds, the fake derives a packet-consistent
 * draft from it (stance from the engine's direction / no-trade flag, narrative
 * templated from the anomaly and quality). It never invents price levels — those
 * are copied from the deterministic engine downstream (hard rule #2).
 */
import { extractPromptFacts, type PromptFacts } from "../prompt";
import { estimateTokens } from "./tokens";
import type { LlmCompletion, LlmCompletionRequest, LlmProvider } from "./types";

/** Round to 2 decimals deterministically. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clamp to the 0..1 confidence range. */
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Derive a deterministic stance from the engine's facts. */
function deriveStance(facts: PromptFacts): "long" | "short" | "no_trade" {
  if (facts.is_no_trade) return "no_trade";
  if (facts.direction === "long" || facts.direction === "short") return facts.direction;
  // No explicit direction: infer from geometry (invalidation below entry → long).
  if (facts.entry_zone && facts.invalidation !== null) {
    const mid = (facts.entry_zone.low + facts.entry_zone.high) / 2;
    return facts.invalidation < mid ? "long" : "short";
  }
  return "no_trade";
}

/** Build a deterministic, packet-consistent briefing draft from the facts. */
function draftFromFacts(facts: PromptFacts): Record<string, unknown> {
  const stance = deriveStance(facts);
  // Confidence tracks data quality, hedged for counter/uncertain setups. The
  // model owns this number (it is not a price level); kept deterministic here.
  const confidence = clamp01(
    stance === "no_trade"
      ? round2(0.5 + facts.quality_score * 0.2)
      : round2(facts.quality_score * 0.75),
  );
  const dir = stance === "no_trade" ? "stand aside" : stance;
  const factors = [
    `trigger: ${facts.anomaly.type} (${facts.anomaly.id})`,
    `context quality: ${facts.quality_label} (${facts.quality_score.toFixed(2)})`,
    ...(facts.degraded_feeds.length > 0
      ? [`degraded feeds: ${facts.degraded_feeds.join(", ")}`]
      : []),
  ];
  const recheck =
    facts.no_trade_recheck.length > 0
      ? facts.no_trade_recheck.join("; ")
      : stance === "no_trade"
        ? "re-evaluate once context quality improves or the anomaly resolves"
        : `re-evaluate if price closes beyond invalidation ${facts.invalidation ?? "n/a"}`;
  return {
    stance,
    thesis:
      stance === "no_trade"
        ? `${facts.primary_asset}: ${facts.anomaly.title} does not present a favorable edge given ${facts.quality_label} context; ${dir} until conditions re-check.`
        : `${facts.primary_asset}: ${facts.anomaly.title} supports a ${dir} bias into the deterministic entry zone, with ${facts.quality_label} supporting context.`,
    factors,
    invalidation_reasoning:
      stance === "no_trade"
        ? "No directional position is proposed, so no invalidation applies."
        : `Thesis is invalidated at the engine level ${facts.invalidation ?? "n/a"}; a close beyond it negates the ${dir} structure.`,
    confidence_reasoning: `Confidence tracks ${facts.quality_label} packet quality (score ${facts.quality_score.toFixed(2)}).`,
    recheck_condition: recheck,
    confidence,
    timeframe: stance === "no_trade" ? "until re-check" : "swing",
  };
}

export class FakeLlmProvider implements LlmProvider {
  readonly name = "fake";

  async complete(req: LlmCompletionRequest): Promise<LlmCompletion> {
    const promptText = req.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const facts = extractPromptFacts(promptText);
    // Structured-output requests with packet facts get a packet-consistent
    // draft; anything else gets a deterministic echo (keeps the fake total).
    const content = facts
      ? JSON.stringify(draftFromFacts(facts))
      : JSON.stringify({ echo: req.messages.at(-1)?.content ?? "" });
    const prompt_tokens = estimateTokens(promptText);
    const completion_tokens = estimateTokens(content);
    return {
      provider: this.name,
      model: req.model,
      content,
      usage: {
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
      cost_usd: 0,
    };
  }
}
