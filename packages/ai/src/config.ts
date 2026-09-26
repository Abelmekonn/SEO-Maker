/**
 * AI configuration: providers, models and routing.
 *
 * Provider and model are resolved here and nowhere else. Feature code asks
 * for a feature; it never names a provider or a model. Which provider serves
 * a feature, which model each provider runs, and the order providers are
 * tried in when one fails are all configuration:
 *
 *   AI_API_KEY_GROQ / AI_API_KEY_GEMINI / AI_API_KEY_GEMINI2    one key each
 *   AI_MODEL_GROQ / AI_MODEL_GEMINI / AI_MODEL_GEMINI2          model per provider
 *   AI_PROVIDER_DEFAULT                                         features with no route of their own
 *   AI_ROUTE_<FEATURE>=<provider>, e.g. AI_ROUTE_SITE_STRATEGY=gemini
 *   AI_PROVIDER_FALLBACKS=gemini,groq,gemini2                   tried in order after the routed one
 *
 * `gemini2` is a second Gemini account: the same API with its own key, so
 * its quota and rate limits are separate from `gemini`'s.
 *
 * A provider with no key is simply skipped, so the app runs with any subset
 * of keys, and with none (AI features then report that they are unavailable;
 * the crawler and deterministic scoring never need a provider).
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
  | "site-strategy"
  | "competitor-insight";

export type AiMode = "quick" | "deep";

/** Mirrors Account.plan. */
export type Plan = "free" | "pro" | "agency";

export type ProviderId = "groq" | "gemini" | "gemini2";

export const PROVIDER_IDS: readonly ProviderId[] = ["groq", "gemini", "gemini2"];

export type ProviderConfig = {
  id: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Per-request ceiling, milliseconds. */
  timeoutMs: number;
  maxRetries: number;
  /** False when no key is set: the provider is skipped. */
  enabled: boolean;
  /**
   * Whether the configured model accepts image input. Verified for the
   * default Gemini model; the OpenAI-compatible defaults are text-only.
   * Override with AI_IMAGE_INPUT_<PROVIDER>=true|false after verifying.
   */
  supportsImages: boolean;
};

export type AiConfig = {
  providers: Record<ProviderId, ProviderConfig>;
  defaultProvider: ProviderId;
  /** Tried in this order after the routed provider fails. */
  fallbacks: ProviderId[];
  /** At least one provider has a key. */
  enabled: boolean;
};

/**
 * Defaults, verified against each provider's model list and with a live
 * structured-output call (September 2026):
 *
 *  - Groq `openai/gpt-oss-120b`: free tier, reliable JSON, fast. Groq's free
 *    tier allows 8,000 tokens a minute on it, which one page prompt fits.
 *  - Gemini `gemini-3.5-flash`: free tier, JSON mode and image input both
 *    verified; 1M-token context. Pro models are not on the free tier, and
 *    `gemini-3.8-flash` answered 503 (overloaded) when tested. The second
 *    Gemini account runs the same model, verified with its own key.
 *
 * Change them with AI_MODEL_<PROVIDER> after checking the provider's list.
 */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  groq: "openai/gpt-oss-120b",
  gemini: "gemini-3.5-flash",
  gemini2: "gemini-3.5-flash",
};

export const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  gemini2: "https://generativelanguage.googleapis.com/v1beta",
};

const IMAGE_INPUT: Record<ProviderId, boolean> = { groq: false, gemini: true, gemini2: true };

/**
 * Which provider serves each feature by default, by what the task needs:
 *
 *  - Groq (the default provider): fast, short structured work on one page:
 *    the page analysis, titles, meta descriptions, headings, schema and
 *    internal links.
 *  - Gemini: long page text and images: content recommendations, and alt
 *    text written from the actual images.
 *  - Gemini, second account: long, reasoning-heavy prompts across a whole
 *    site or two sites: site strategy, site opportunities, competitor
 *    comparison. A key of its own keeps these large prompts from using up
 *    the first account's quota for page work.
 *
 * Features not listed use AI_PROVIDER_DEFAULT. Every entry can be changed with
 * AI_ROUTE_<FEATURE> without touching feature code.
 */
export const FEATURE_ROUTES: Partial<Record<AiFeature, ProviderId>> = {
  content: "gemini",
  "image-alt": "gemini",
  "site-opportunity": "gemini2",
  "site-strategy": "gemini2",
  "competitor-insight": "gemini2",
};

/**
 * Fallback order when the routed provider fails. Gemini first: its context
 * window and free-tier limits absorb a large prompt that Groq's per-minute
 * token limit would reject. The second Gemini account comes last: it runs
 * the same model, so a Gemini outage usually affects both.
 */
const DEFAULT_FALLBACKS: ProviderId[] = ["gemini", "groq", "gemini2"];

const DEFAULTS = { timeoutMs: 45_000, maxRetries: 2 } as const;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function int(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = env(name)?.toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

export function isProviderId(value: string | undefined): value is ProviderId {
  return value === "groq" || value === "gemini" || value === "gemini2";
}

function providerList(raw: string | undefined): ProviderId[] | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(isProviderId);
  return ids.length ? [...new Set(ids)] : null;
}

/** "site-strategy" -> "SITE_STRATEGY", for AI_ROUTE_<FEATURE>. */
export function routeEnvName(feature: AiFeature): string {
  return `AI_ROUTE_${feature.toUpperCase().replace(/-/g, "_")}`;
}

/**
 * Reads configuration from the environment.
 *
 * Never throws on a missing key: a missing key disables that provider, and no
 * keys at all disables AI features, not the worker.
 */
export function loadAiConfig(): AiConfig {
  const timeoutMs = int("AI_TIMEOUT_MS", DEFAULTS.timeoutMs) || DEFAULTS.timeoutMs;
  const maxRetries = int("AI_MAX_RETRIES", DEFAULTS.maxRetries);

  const providers = Object.fromEntries(
    PROVIDER_IDS.map((id) => {
      const upper = id.toUpperCase();
      const apiKey = env(`AI_API_KEY_${upper}`) ?? "";
      const config: ProviderConfig = {
        id,
        apiKey,
        model: env(`AI_MODEL_${upper}`) ?? DEFAULT_MODELS[id],
        baseUrl: (env(`AI_BASE_URL_${upper}`) ?? DEFAULT_BASE_URLS[id]).replace(/\/+$/, ""),
        timeoutMs,
        maxRetries,
        enabled: apiKey.length > 0,
        supportsImages: bool(`AI_IMAGE_INPUT_${upper}`, IMAGE_INPUT[id]),
      };
      return [id, config];
    }),
  ) as Record<ProviderId, ProviderConfig>;

  const requestedDefault = env("AI_PROVIDER_DEFAULT")?.toLowerCase();
  const defaultProvider: ProviderId = isProviderId(requestedDefault) ? requestedDefault : "groq";

  return {
    providers,
    defaultProvider,
    fallbacks: providerList(env("AI_PROVIDER_FALLBACKS")) ?? DEFAULT_FALLBACKS,
    enabled: PROVIDER_IDS.some((id) => providers[id].enabled),
  };
}

/** One provider and model to try. */
export type AiRoute = { provider: ProviderId; model: string };

/** The provider a feature is routed to, before fallbacks and before key checks. */
export function primaryProviderFor(feature: AiFeature, config: AiConfig = loadAiConfig()): ProviderId {
  const override = env(routeEnvName(feature))?.toLowerCase();
  if (isProviderId(override)) return override;
  return FEATURE_ROUTES[feature] ?? config.defaultProvider;
}

/**
 * Every route to try for a feature, in order: the routed provider, then the
 * fallbacks. Providers without a key are left out. Empty when no provider
 * is configured.
 */
export function routesFor(feature: AiFeature, config: AiConfig = loadAiConfig()): AiRoute[] {
  const primary = primaryProviderFor(feature, config);
  const order = [primary, ...config.fallbacks, ...PROVIDER_IDS].filter(
    (id, index, list) => list.indexOf(id) === index,
  );
  return order
    .filter((id) => config.providers[id].enabled)
    .map((id) => ({ provider: id, model: config.providers[id].model }));
}

/**
 * The cache and bookkeeping identity of a feature's route: the routed
 * provider and model, whichever provider eventually answered. Changing the
 * route or the model changes it, so an answer is never served from a cache
 * written for different configuration.
 */
export function routeKey(feature: AiFeature, config: AiConfig = loadAiConfig()): string {
  const primary = primaryProviderFor(feature, config);
  return `${primary}:${config.providers[primary].model}`;
}

/**
 * Prompt version of the page features, hashed into the cache key.
 *
 * Bump this whenever a page prompt's wording changes in a way that should
 * invalidate previously generated output.
 */
export const PROMPT_VERSION = "2.0.0";

/**
 * Prompt version per feature. One global version meant rewording the site
 * prompt invalidated every cached page result too; per-feature versions let
 * a prompt change ship on its own, and every AiResult records the version
 * that produced it.
 */
export const PROMPT_VERSIONS: Record<AiFeature, string> = {
  // Title, meta and heading now ask for three or four options rather than up
  // to three. Not bumped: a cached result with fewer options still fits the
  // contract and is still a valid answer, so it is kept.
  "page-recommendation": PROMPT_VERSION,
  title: PROMPT_VERSION,
  meta: PROMPT_VERSION,
  heading: PROMPT_VERSION,
  // 3.0.0: alt text may be written from the image itself when one is attached.
  "image-alt": "3.0.0",
  content: PROMPT_VERSION,
  schema: PROMPT_VERSION,
  "internal-link": PROMPT_VERSION,
  "site-opportunity": "3.0.0",
  "site-strategy": "1.0.0",
  // 5.0.0: structural differences and opportunities.
  "competitor-insight": "5.0.0",
};

export function promptVersionFor(feature: AiFeature): string {
  return PROMPT_VERSIONS[feature] ?? PROMPT_VERSION;
}

/**
 * Published list prices, US dollars per million tokens, for internal cost
 * monitoring only: never shown to users. Free-tier use costs nothing, and a
 * model not listed here gets no estimate rather than a wrong one. Override
 * with AI_PRICE_INPUT_PER_M and AI_PRICE_OUTPUT_PER_M.
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

/**
 * Whether a feature's routes include a provider that accepts images. Alt
 * text is written from the image itself only then; otherwise it falls back to
 * captions, nearby text and filenames.
 */
export function imageInputAvailable(feature: AiFeature = "image-alt", config: AiConfig = loadAiConfig()): boolean {
  return routesFor(feature, config).some((route) => config.providers[route.provider].supportsImages);
}
