/**
 * Provider registry and the retry wrapper (Phase 1.1, 1.4).
 *
 * `getAiProvider()` is the only way feature code obtains a provider, and
 * `generateStructured()` is the only call it makes.
 */

import { loadAiConfig, type AiConfig } from "../config";
import { OpenAiCompatibleProvider } from "./groq";
import { AiError, type AiProvider, type StructuredRequest, type StructuredResponse } from "./types";

export { AiError } from "./types";
export { parseAndValidate, parseRetryAfter, OpenAiCompatibleProvider } from "./groq";
export type { AiProvider, StructuredRequest, StructuredResponse, AiErrorKind, TokenUsage } from "./types";

let cached: { provider: AiProvider; config: AiConfig } | null = null;

export function getAiProvider(config: AiConfig = loadAiConfig()): AiProvider {
  if (cached && cached.config.provider === config.provider && cached.config.model === config.model) {
    return cached.provider;
  }

  const provider = createProvider(config);
  cached = { provider, config };
  return provider;
}

function createProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case "groq":
    case "openai":
      // Both speak the same wire format; only the base URL differs, and that
      // comes from config. A provider that does not would get its own class.
      return new OpenAiCompatibleProvider(config);
    default:
      throw new AiError(
        "not-configured",
        `Unknown AI_PROVIDER "${config.provider}". Supported: groq, openai.`,
      );
  }
}

/** Test seam: lets a fake provider stand in without touching the environment. */
export function setAiProviderForTesting(provider: AiProvider | null, config?: AiConfig): void {
  cached = provider ? { provider, config: config ?? loadAiConfig() } : null;
}

export type GenerateOptions = {
  config?: AiConfig;
  provider?: AiProvider;
  /** Overrides config.maxRetries. */
  maxRetries?: number;
  /** Injected in tests so retry backoff does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Rate limits get their own, longer budget.
 *
 * A per-minute token limit (Groq's free tier is 8,000 TPM, and one page prompt
 * is ~7,000 tokens) clears in under a minute. Exponential backoff from 400ms
 * spends every retry inside the same window and fails a job that would have
 * succeeded 40 seconds later. So a 429 waits as long as the provider asks, up
 * to a cap that keeps a job inside the AI worker's 5 minute lock; a longer
 * wait (a daily quota) fails straight away instead of holding a worker slot.
 */
const RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 65_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls the provider with bounded retries and exponential backoff (Phase 1.4).
 *
 * Only `retryable` failures are retried. A 401 or an unknown provider fails on
 * the first attempt rather than making three identical doomed requests.
 */
export async function generateStructured<T>(
  request: StructuredRequest<T>,
  options: GenerateOptions = {},
): Promise<StructuredResponse<T>> {
  const config = options.config ?? loadAiConfig();
  const provider = options.provider ?? getAiProvider(config);
  const maxRetries = options.maxRetries ?? config.maxRetries;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: AiError | null = null;
  let rateLimitWaits = 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const result = await provider.generateStructured(request);
      return { ...result, attempts: attempt };
    } catch (error) {
      const aiError =
        error instanceof AiError
          ? error
          : new AiError("provider-error", "The AI call failed.", {
              detail: error instanceof Error ? error.message : String(error),
            });

      lastError = aiError;

      if (aiError.kind === "rate-limited" && aiError.retryAfterMs != null) {
        if (aiError.retryAfterMs > MAX_RATE_LIMIT_WAIT_MS || rateLimitWaits >= RATE_LIMIT_RETRIES) {
          throw aiError;
        }
        rateLimitWaits += 1;
        // A rate-limit wait is not a failed attempt at the task itself, so it
        // does not use up the ordinary retry budget.
        attempt -= 1;
        await sleep(aiError.retryAfterMs + 250 + Math.floor(Math.random() * 750));
        continue;
      }

      if (!aiError.retryable || attempt > maxRetries) {
        throw aiError;
      }

      // 400ms, 800ms, 1600ms, with jitter so concurrent jobs do not retry in
      // lockstep after a shared rate-limit response.
      const backoff = 400 * 2 ** (attempt - 1);
      await sleep(backoff + Math.floor(Math.random() * 200));
    }
  }

  throw lastError ?? new AiError("provider-error", "The AI call failed.");
}
