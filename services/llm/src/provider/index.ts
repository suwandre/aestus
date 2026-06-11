/**
 * Provider barrel + factory (P13-T002).
 *
 * `createProvider` is the one place that chooses a concrete provider from
 * config: Ollama Cloud when `OLLAMA_API_KEY` is set, the deterministic fake
 * otherwise (fixture-first, hard rule #5). Because everything downstream depends
 * only on {@link LlmProvider}, swapping providers here changes no briefing logic
 * (T002 done-when).
 */
import type { LlmConfig } from "../config";
import { FakeLlmProvider } from "./fake";
import { OllamaProvider } from "./ollama";
import type { LlmProvider } from "./types";

export * from "./types";
export { FakeLlmProvider } from "./fake";
export { OllamaProvider, type OllamaProviderOptions, type OllamaPricing } from "./ollama";
export { estimateTokens, estimateMessagesTokens } from "./tokens";
export { withRetry, withTimeout, LlmTimeoutError, type RetryPolicy } from "./retry";

/** Choose a provider from config. Returns the fake when no API key is present. */
export function createProvider(config: LlmConfig): LlmProvider {
  if (config.ollamaApiKey) {
    return new OllamaProvider({
      baseUrl: config.ollamaBaseUrl,
      apiKey: config.ollamaApiKey,
      timeoutMs: config.requestTimeoutMs,
      maxRetries: config.maxRetries,
    });
  }
  return new FakeLlmProvider();
}
