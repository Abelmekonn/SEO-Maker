/**
 * Provider registry, the retry wrapper and cross-provider fallback.
 *
 *   runAiFeature -> generateWithFallback(routes)
 *                     -> generateStructured(provider A)   retries, rate-limit waits
 *                     -> generateStructured(provider B)   when A fails for good
 *
 * Feature code never sees a provider: it names a feature, config decides the
 * routes, and this module walks them.
 */

import { type AiConfig, type AiRoute, type ProviderConfig, type ProviderId, loadAiConfig } from "../config";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { AiError, type AiImage, type AiProvider, type StructuredRequest, type StructuredResponse } from "./types";

export { AiError } from "./types";
export { parseAndValidate, parseRetryAfter, OpenAiCompatibleProvider, providerError } from "./openai-compatible";
export { GroqProvider } from "./groq";
export { GeminiProvider, geminiError } from "./gemini";
export type { AiImage, AiProvider, StructuredRequest, StructuredResponse, AiErrorKind, TokenUsage } from "./types";

const instances = new Map<string, AiProvider>();
let testOverride: ((id: ProviderId) => AiProvider | null) | null = null;

function createProvider(config: ProviderConfig): AiProvider {
  switch (config.id) {
    case "groq":
      return new GroqProvider(config);
    case "gemini":
    case "gemini2":
      return new GeminiProvider(config);
  }
}

/** The provider instance for an id, rebuilt when its configuration changes. */
export function getAiProvider(id: ProviderId, config: AiConfig = loadAiConfig()): AiProvider {
  const override = testOverride?.(id);
  if (override) return override;
  const providerConfig = config.providers[id];
  const key = `${id}|${providerConfig.baseUrl}|${providerConfig.apiKey.length}|${providerConfig.supportsImages}|${providerConfig.timeoutMs}`;
  const existing = instances.get(key);
  if (existing) return existing;
  const provider = createProvider(providerConfig);
  instances.set(key, provider);
  return provider;
}

/** Test seam: fake providers stand in without touching the environment. */
export function setAiProvidersForTesting(factory: ((id: ProviderId) => AiProvider | null) | null): void {
  testOverride = factory;
  breaker.clear();
}

export type GenerateOptions = {
  /** One provider, bypassing routing. Used by tests and the benchmark. */
  provider?: AiProvider;
  config?: AiConfig;
  /** Overrides the provider's maxRetries. */
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
 * wait (a daily quota) fails straight away, and the next provider is tried.
 */
const RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 65_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A wait that ends early when the caller cancels. A rate-limit wait can hold a
 * job for over a minute, and a user who pressed Stop should not sit through it.
 */
function sleepUnlessAborted(ms: number, signal: AbortSignal | undefined, sleep: (ms: number) => Promise<void>) {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      signal.removeEventListener("abort", done);
      resolve();
    };
    signal.addEventListener("abort", done, { once: true });
    void sleep(ms).then(done);
  });
}

function cancelled(): AiError {
  return new AiError("cancelled", "The AI call was cancelled.");
}

function asAiError(error: unknown, provider?: string): AiError {
  return error instanceof AiError
    ? error
    : new AiError("provider-error", "The AI call failed.", {
        detail: error instanceof Error ? error.message : String(error),
        provider: provider ?? null,
      });
}

/**
 * Calls one provider with bounded retries and exponential backoff.
 *
 * Only `retryable` failures are retried. A 401 or a billing error fails on
 * the first attempt rather than making three identical doomed requests.
 */
export async function generateStructured<T>(
  request: StructuredRequest<T>,
  options: GenerateOptions & { provider: AiProvider },
): Promise<StructuredResponse<T>> {
  const provider = options.provider;
  const maxRetries = options.maxRetries ?? 2;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: AiError | null = null;
  let rateLimitWaits = 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    if (request.signal?.aborted) {
      throw cancelled();
    }
    try {
      const result = await provider.generateStructured(request);
      return { ...result, attempts: attempt };
    } catch (error) {
      const aiError = asAiError(error, provider.name);
      lastError = aiError;

      if (aiError.kind === "cancelled" || request.signal?.aborted) {
        throw cancelled();
      }

      if (aiError.kind === "rate-limited" && aiError.retryAfterMs != null) {
        if (aiError.retryAfterMs > MAX_RATE_LIMIT_WAIT_MS || rateLimitWaits >= RATE_LIMIT_RETRIES) {
          throw aiError;
        }
        rateLimitWaits += 1;
        // A rate-limit wait is not a failed attempt at the task itself, so it
        // does not use up the ordinary retry budget.
        attempt -= 1;
        await sleepUnlessAborted(aiError.retryAfterMs + 250 + Math.floor(Math.random() * 750), request.signal, sleep);
        continue;
      }

      if (!aiError.retryable || attempt > maxRetries) {
        throw aiError;
      }

      // 400ms, 800ms, 1600ms, with jitter so concurrent jobs do not retry in
      // lockstep after a shared rate-limit response. An overloaded provider
      // (503 "high demand", 529) needs seconds, not milliseconds, to recover.
      const overloaded = aiError.status === 503 || aiError.status === 529;
      const backoff = (overloaded ? 2_500 : 400) * 2 ** (attempt - 1);
      await sleepUnlessAborted(backoff + Math.floor(Math.random() * 200), request.signal, sleep);
    }
  }

  throw lastError ?? new AiError("provider-error", "The AI call failed.");
}

/**
 * Providers that recently failed in a way the next minutes will not change:
 * a rejected key, billing, a model not on the tier, a daily quota. Skipping
 * them saves every later call a doomed round trip. In memory per process;
 * a restart simply tries again.
 */
const breaker = new Map<ProviderId, { until: number; reason: string }>();
const BREAKER_MS = 10 * 60 * 1000;

function trip(provider: ProviderId, error: AiError) {
  if (error.kind === "auth" || error.kind === "unavailable" || error.kind === "not-configured") {
    breaker.set(provider, { until: Date.now() + BREAKER_MS, reason: error.message });
  } else if (error.kind === "rate-limited" && (error.retryAfterMs ?? 0) > MAX_RATE_LIMIT_WAIT_MS) {
    breaker.set(provider, { until: Date.now() + Math.min(error.retryAfterMs ?? BREAKER_MS, 60 * 60 * 1000), reason: error.message });
  }
}

function tripped(provider: ProviderId): boolean {
  const entry = breaker.get(provider);
  if (!entry) return false;
  if (entry.until > Date.now()) return true;
  breaker.delete(provider);
  return false;
}

/** Providers currently skipped, and why. For worker logs and support. */
export function trippedProviders(): Array<{ provider: ProviderId; reason: string; until: Date }> {
  return [...breaker.entries()]
    .filter(([provider]) => tripped(provider))
    .map(([provider, entry]) => ({ provider, reason: entry.reason, until: new Date(entry.until) }));
}

export type FallbackRequest<T> = Omit<StructuredRequest<T>, "model" | "system" | "user" | "images"> & {
  /** Images to show a provider that accepts them. */
  images?: AiImage[];
  /**
   * The prompt, built for whether the images will actually reach the model:
   * a text-only provider must not be told to look at an image it never gets.
   */
  prompt: (imagesAttached: boolean) => { system: string; user: string };
};

/**
 * Walks the routes until one provider answers with valid output.
 *
 * Each provider gets its own retries first. Anything but a cancellation then
 * moves on: a rejected key, a billing error, a model the key cannot use, a
 * rate limit that will not clear in time, a timeout, or output that kept
 * failing the contract. The error thrown when every route fails is the first
 * provider's, since that is the configured one.
 */
export async function generateWithFallback<T>(
  request: FallbackRequest<T>,
  routes: AiRoute[],
  options: Omit<GenerateOptions, "provider"> = {},
): Promise<StructuredResponse<T>> {
  const config = options.config ?? loadAiConfig();
  if (routes.length === 0) {
    throw new AiError("not-configured", "No AI provider is configured. Set AI_API_KEY_GROQ, AI_API_KEY_GEMINI or AI_API_KEY_GEMINI2.");
  }

  const failed: ProviderId[] = [];
  const errors: Array<{ provider: ProviderId; error: AiError }> = [];
  const open = routes.filter((route) => !tripped(route.provider));
  // Every route tripped: try them anyway rather than fail without a call.
  const candidates = open.length > 0 ? open : routes;

  for (const route of candidates) {
    if (request.signal?.aborted) throw cancelled();
    const provider = getAiProvider(route.provider, config);
    const imagesAttached = Boolean(provider.supportsImages && request.images?.length);
    const { system, user } = request.prompt(imagesAttached);
    try {
      const response = await generateStructured(
        {
          feature: request.feature,
          mode: request.mode,
          schema: request.schema,
          schemaName: request.schemaName,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          signal: request.signal,
          model: route.model,
          system,
          user,
          images: imagesAttached ? request.images : undefined,
        },
        { ...options, provider, maxRetries: options.maxRetries ?? config.providers[route.provider].maxRetries },
      );
      return { ...response, fallbackFrom: failed.length ? failed : undefined, imagesSent: imagesAttached };
    } catch (error) {
      const aiError = asAiError(error, route.provider);
      if (aiError.kind === "cancelled") throw aiError;
      trip(route.provider, aiError);
      failed.push(route.provider);
      errors.push({ provider: route.provider, error: aiError });
    }
  }

  const first = errors[0];
  if (!first) throw new AiError("provider-error", "The AI call failed.");
  if (errors.length === 1) throw first.error;
  // Keep the first provider's error kind, and record what each one said.
  throw new AiError(first.error.kind, first.error.message, {
    status: first.error.status,
    retryAfterMs: first.error.retryAfterMs,
    provider: first.provider,
    retryable: false,
    detail: errors
      .map(({ provider, error }) => `${provider}: ${error.kind} ${error.message}${error.detail ? ` (${error.detail.slice(0, 200)})` : ""}`)
      .join(" || ")
      .slice(0, 1500),
  });
}
