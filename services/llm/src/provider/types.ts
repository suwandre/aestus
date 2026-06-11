/**
 * Model-provider abstraction (P13-T001 skeleton; formalized in T002).
 *
 * Briefing logic depends only on this interface, never on a concrete provider,
 * so Ollama Cloud, a future provider, and the deterministic fake are swappable
 * without touching generation code (T002 done-when). A provider takes chat
 * messages + an optional JSON-schema for structured output and returns the
 * completion text plus token usage and cost (hard rule #7 — cost stays visible).
 */
export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionRequest {
  /** Provider-specific model id, e.g. `kimi-k2.6` (resolved by routing). */
  model: string;
  messages: LlmMessage[];
  /**
   * JSON Schema the response must conform to. When set, the provider requests
   * structured output and `content` is a JSON document matching the schema.
   */
  responseSchema?: Record<string, unknown>;
  /** Sampling temperature; providers default to a low value for determinism. */
  temperature?: number;
  /** Upper bound on completion tokens. */
  maxTokens?: number;
}

/** Token accounting for one completion (mirrors `CostMetadata` token fields). */
export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LlmCompletion {
  provider: string;
  model: string;
  /** Completion text; a JSON document when `responseSchema` was supplied. */
  content: string;
  usage: LlmUsage;
  /**
   * Marginal USD cost of this call. Zero for the fake provider and for
   * flat-rate subscription billing (Ollama Cloud), but still surfaced so a
   * per-token provider can populate it without any contract change.
   */
  cost_usd: number;
}

/** A chat/completion provider. Concrete impls: {@link FakeLlmProvider}, Ollama. */
export interface LlmProvider {
  /** Stable provider id stored on the briefing's cost metadata. */
  readonly name: string;
  /** Run one completion. Implementations apply their own timeout/retry (T002). */
  complete(req: LlmCompletionRequest): Promise<LlmCompletion>;
}
