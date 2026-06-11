/**
 * Token estimation (P13-T002).
 *
 * A provider-agnostic, deterministic estimate (~4 chars/token) used to (a) let
 * the fake provider report plausible usage and (b) budget a request before a
 * call so the briefing layer can stay inside the cost envelope (hard rule #7)
 * without depending on any provider's tokenizer.
 */
import type { LlmMessage } from "./types";

/** Estimate the token count of a string (~4 chars/token, min 1). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Estimate the prompt token count of a chat message array. */
export function estimateMessagesTokens(messages: LlmMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}
