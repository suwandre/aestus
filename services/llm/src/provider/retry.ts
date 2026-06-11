/**
 * Timeout + retry helpers for provider calls (P13-T002).
 *
 * A real model call can hang or fail transiently; the briefing layer must not.
 * These wrappers give every provider a uniform timeout and bounded retry with
 * backoff, so the interface can promise "timeout, retry" without each provider
 * reimplementing it. The fake provider never needs them (it is instant).
 */

/** Raised when a provider call exceeds its deadline. */
export class LlmTimeoutError extends Error {
  constructor(ms: number, label: string) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "LlmTimeoutError";
  }
}

/** Reject if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LlmTimeoutError(ms, label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface RetryPolicy {
  /** Max attempts after the first (0 = no retry). */
  retries: number;
  /** Per-attempt timeout in ms. */
  timeoutMs: number;
  /** Base backoff between attempts (ms); doubled each retry. */
  backoffMs?: number;
  /** Async sleep, injectable so tests don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Observability hook fired before each retry. */
  onRetry?: (attempt: number, error: unknown) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` with a per-attempt timeout, retrying up to `policy.retries` times
 * with exponential backoff. Throws the last error if every attempt fails.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  label = "llm call",
): Promise<T> {
  const backoffMs = policy.backoffMs ?? 250;
  const sleep = policy.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    try {
      return await withTimeout(fn(), policy.timeoutMs, label);
    } catch (err) {
      lastError = err;
      if (attempt === policy.retries) break;
      policy.onRetry?.(attempt + 1, err);
      await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastError;
}
