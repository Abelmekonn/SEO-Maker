/**
 * AI configuration (Phase 1.2).
 *
 * Provider and model are resolved here and nowhere else. Feature code asks for
 * a feature and a mode; it never names a model, so swapping Groq for another
 * provider — or routing premium users to a stronger model — is a change to this
 * file alone.
 */

export type AiFeature =
  | "page-recommendation"
  | "title"
  | "meta"
  | "heading"
  | "image-alt"
  | "content"
  | "schema"
  | "internal-link"
  | "site-opportunity"
  | "competitor-insight";

export type AiMode = "quick" | "deep";

/** Mirrors Account.plan. Agency is the top tier, so it is the one premium routing targets. */
export type Plan = "free" | "pro" | "agency";

export type AiConfig = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  /** Per-request ceiling, milliseconds. */
  timeoutMs: number;
  maxRetries: number;
  /** Set when no API key is configured: the app runs, AI features report unavailable. */
  enabled: boolean;
};

const DEFAULTS = {
  provider: "groq",
  model: "openai/gpt-oss-120b",
  baseUrl: "https://api.groq.com/openai/v1",
  timeoutMs: 45_000,
  maxRetries: 2,
} as const;

const BASE_URLS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1",
  openai: "https://api.openai.com/v1",
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function int(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads configuration from the environment.
 *
 * Never throws on a missing key. A missing key means AI features are disabled,
 * not that the worker crashes on boot — the crawler and deterministic scoring
 * must keep working without any AI provider configured.
 */
export function loadAiConfig(): AiConfig {
  const provider = env("AI_PROVIDER") ?? DEFAULTS.provider;
  const apiKey = env("AI_API_KEY") ?? "";

  return {
    provider,
    model: env("AI_MODEL") ?? DEFAULTS.model,
    apiKey,
    baseUrl: env("AI_BASE_URL") ?? BASE_URLS[provider] ?? DEFAULTS.baseUrl,
    timeoutMs: int("AI_TIMEOUT_MS", DEFAULTS.timeoutMs),
    maxRetries: int("AI_MAX_RETRIES", DEFAULTS.maxRetries),
    enabled: apiKey.length > 0,
  };
}

export type ResolveModelInput = {
  plan?: Plan | null;
  feature: AiFeature;
  mode: AiMode;
};

/**
 * Chooses the model for one call (Phase 1.2).
 *
 * Today every route returns the configured development model. The shape is what
 * matters: premium routing becomes a table here rather than a conditional
 * scattered through feature code.
 */
export function resolveModel(input: ResolveModelInput, config = loadAiConfig()): string {
  const premiumModel = env("AI_MODEL_PREMIUM");
  if (premiumModel && input.plan === "agency") {
    return premiumModel;
  }

  // Deep analysis on a paid plan is where a stronger model would earn its cost
  // first. Until one is configured, this deliberately returns the same model.
  const deepModel = env("AI_MODEL_DEEP");
  if (deepModel && input.mode === "deep" && input.plan && input.plan !== "free") {
    return deepModel;
  }

  return config.model;
}

/**
 * Prompt version, hashed into the cache key (Phase 1.10).
 *
 * Bump this whenever a prompt's wording changes in a way that should invalidate
 * previously generated output.
 */
export const PROMPT_VERSION = "2.0.0";

/**
 * Published list prices, US dollars per million tokens (Phase 2.6).
 *
 * Estimates for the dashboard's cost column, not billing. Check them against
 * the provider's pricing page and override with AI_PRICE_INPUT_PER_M and
 * AI_PRICE_OUTPUT_PER_M when they change. A model not listed here and not
 * overridden gets no estimate rather than a wrong one.
 */
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.75 },
  "openai/gpt-oss-20b": { input: 0.1, output: 0.5 },
  "qwen/qwen3.8-27b": { input: 0.29, output: 0.59 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
};

export function estimateCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (inputTokens == null && outputTokens == null) {
    return null;
  }
  const inputOverride = Number(env("AI_PRICE_INPUT_PER_M"));
  const outputOverride = Number(env("AI_PRICE_OUTPUT_PER_M"));
  const listed = PRICE_PER_MILLION[model];
  const price =
    Number.isFinite(inputOverride) && inputOverride > 0 && Number.isFinite(outputOverride) && outputOverride > 0
      ? { input: inputOverride, output: outputOverride }
      : listed;
  if (!price) {
    return null;
  }
  const cost = ((inputTokens ?? 0) * price.input + (outputTokens ?? 0) * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
