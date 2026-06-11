/**
 * Ollama Cloud provider (P13-T002).
 *
 * Implements {@link LlmProvider} against Ollama Cloud's OpenAI-compatible
 * `/chat/completions` endpoint (the runtime-LLM-provider DECISION in
 * progress.md). Structured output is requested via `response_format` with the
 * draft's JSON Schema so the model returns conforming JSON. Timeout + bounded
 * retry come from the shared {@link withRetry} wrapper.
 *
 * Cost: Ollama Cloud is flat-rate subscription billing, so marginal `cost_usd`
 * is 0 by default; an optional per-1K-token price table lets a metered provider
 * populate it with no change to briefing logic (hard rule #7). This class is
 * only constructed when `OLLAMA_API_KEY` is set — fixture-first dev/tests use
 * {@link FakeLlmProvider}.
 */
import { withRetry } from "./retry";
import { estimateMessagesTokens, estimateTokens } from "./tokens";
import type { LlmCompletion, LlmCompletionRequest, LlmProvider } from "./types";

export interface OllamaPricing {
  /** USD per 1K prompt tokens. */
  promptPer1k: number;
  /** USD per 1K completion tokens. */
  completionPer1k: number;
}

export interface OllamaProviderOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  /** Per-token pricing; omit/zero for flat-rate subscription billing. */
  pricing?: OllamaPricing;
}

/** Shape of the OpenAI-compatible chat completion response we consume. */
interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export class OllamaProvider implements LlmProvider {
  readonly name = "ollama";

  constructor(private readonly opts: OllamaProviderOptions) {}

  async complete(req: LlmCompletionRequest): Promise<LlmCompletion> {
    const body = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0,
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      ...(req.responseSchema !== undefined
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: "briefing_draft", schema: req.responseSchema, strict: true },
            },
          }
        : {}),
    };

    const json = await withRetry(
      async () => {
        const res = await fetch(`${this.opts.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.opts.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 500)}`);
        }
        return (await res.json()) as ChatCompletionResponse;
      },
      { retries: this.opts.maxRetries, timeoutMs: this.opts.timeoutMs },
      `ollama ${req.model}`,
    );

    const content = json.choices?.[0]?.message?.content ?? "";
    const prompt_tokens = json.usage?.prompt_tokens ?? estimateMessagesTokens(req.messages);
    const completion_tokens = json.usage?.completion_tokens ?? estimateTokens(content);
    const total_tokens = json.usage?.total_tokens ?? prompt_tokens + completion_tokens;
    const cost_usd = this.opts.pricing
      ? round6(
          (prompt_tokens / 1000) * this.opts.pricing.promptPer1k +
            (completion_tokens / 1000) * this.opts.pricing.completionPer1k,
        )
      : 0;

    return {
      provider: this.name,
      model: req.model,
      content,
      usage: { prompt_tokens, completion_tokens, total_tokens },
      cost_usd,
    };
  }
}
