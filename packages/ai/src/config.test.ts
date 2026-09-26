import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MODELS,
  PROMPT_VERSION,
  estimateCost,
  loadAiConfig,
  primaryProviderFor,
  promptVersionFor,
  routeEnvName,
  routeKey,
  routesFor,
} from "./config";

const saved = { ...process.env };

const AI_VARS = [
  "AI_API_KEY",
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_PROVIDER_DEFAULT",
  "AI_PROVIDER_FALLBACKS",
  "AI_API_KEY_GROQ",
  "AI_API_KEY_GEMINI",
  "AI_API_KEY_GEMINI2",
  "AI_API_KEY_CEREBRAS",
  "AI_MODEL_GROQ",
  "AI_MODEL_GEMINI",
  "AI_MODEL_GEMINI2",
  "AI_ROUTE_SITE_STRATEGY",
  "AI_ROUTE_TITLE",
  "AI_IMAGE_INPUT_GROQ",
  "AI_TIMEOUT_MS",
];

beforeEach(() => {
  for (const name of AI_VARS) delete process.env[name];
});

afterEach(() => {
  process.env = { ...saved };
});

function keys(...providers: Array<"groq" | "gemini" | "gemini2">) {
  for (const provider of providers) process.env[`AI_API_KEY_${provider.toUpperCase()}`] = `${provider}-key`;
}

describe("loadAiConfig", () => {
  it("disables AI when no provider key is set rather than throwing", () => {
    // The crawler and deterministic scoring must boot without a provider.
    expect(loadAiConfig().enabled).toBe(false);
  });

  it("ignores the retired generic AI_API_KEY", () => {
    process.env.AI_API_KEY = "old-key";
    expect(loadAiConfig().enabled).toBe(false);
  });

  it("reads one key per provider", () => {
    keys("gemini");
    const config = loadAiConfig();
    expect(config.enabled).toBe(true);
    expect(config.providers.gemini.enabled).toBe(true);
    expect(config.providers.groq.enabled).toBe(false);
  });

  it("reads the second Gemini key as a provider of its own", () => {
    keys("gemini2");
    const config = loadAiConfig();
    expect(config.providers.gemini2.enabled).toBe(true);
    expect(config.providers.gemini2.apiKey).toBe("gemini2-key");
    expect(config.providers.gemini.enabled).toBe(false);
  });

  it("no longer reads a Cerebras key", () => {
    process.env.AI_API_KEY_CEREBRAS = "old-key";
    expect(loadAiConfig().enabled).toBe(false);
  });

  it("uses the verified default model per provider, overridable per provider", () => {
    process.env.AI_MODEL_GROQ = "openai/gpt-oss-20b";
    const config = loadAiConfig();
    expect(config.providers.groq.model).toBe("openai/gpt-oss-20b");
    expect(config.providers.gemini.model).toBe(DEFAULT_MODELS.gemini);
    expect(config.providers.gemini2.model).toBe(DEFAULT_MODELS.gemini2);
  });

  it("marks only Gemini as accepting images by default", () => {
    const config = loadAiConfig();
    expect(config.providers.gemini.supportsImages).toBe(true);
    expect(config.providers.gemini2.supportsImages).toBe(true);
    expect(config.providers.groq.supportsImages).toBe(false);
    process.env.AI_IMAGE_INPUT_GROQ = "true";
    expect(loadAiConfig().providers.groq.supportsImages).toBe(true);
  });

  it("falls back to defaults for a malformed timeout", () => {
    process.env.AI_TIMEOUT_MS = "not-a-number";
    expect(loadAiConfig().providers.groq.timeoutMs).toBe(45_000);
  });
});

describe("routing", () => {
  it("routes short page features to the default provider (Groq)", () => {
    expect(primaryProviderFor("title")).toBe("groq");
    expect(primaryProviderFor("meta")).toBe("groq");
    expect(primaryProviderFor("page-recommendation")).toBe("groq");
  });

  it("routes long-text and image features to Gemini", () => {
    expect(primaryProviderFor("content")).toBe("gemini");
    expect(primaryProviderFor("image-alt")).toBe("gemini");
  });

  it("routes site and competitor reasoning to the second Gemini account", () => {
    expect(primaryProviderFor("site-strategy")).toBe("gemini2");
    expect(primaryProviderFor("site-opportunity")).toBe("gemini2");
    expect(primaryProviderFor("competitor-insight")).toBe("gemini2");
  });

  it("lets configuration move a feature without touching feature code", () => {
    process.env[routeEnvName("site-strategy")] = "gemini";
    process.env.AI_PROVIDER_DEFAULT = "gemini";
    expect(primaryProviderFor("site-strategy")).toBe("gemini");
    expect(primaryProviderFor("title")).toBe("gemini");
  });

  it("tries the routed provider first, then the fallbacks, skipping providers without a key", () => {
    keys("groq", "gemini", "gemini2");
    expect(routesFor("site-strategy").map((route) => route.provider)).toEqual(["gemini2", "gemini", "groq"]);
    expect(routesFor("title").map((route) => route.provider)).toEqual(["groq", "gemini", "gemini2"]);

    delete process.env.AI_API_KEY_GEMINI2;
    expect(routesFor("site-strategy").map((route) => route.provider)).toEqual(["gemini", "groq"]);
  });

  it("honours a configured fallback order", () => {
    keys("groq", "gemini", "gemini2");
    process.env.AI_PROVIDER_FALLBACKS = "groq,gemini2";
    expect(routesFor("content").map((route) => route.provider)).toEqual(["gemini", "groq", "gemini2"]);
  });

  it("returns no routes when nothing is configured", () => {
    expect(routesFor("title")).toEqual([]);
  });

  it("keys the cache on the routed provider and model", () => {
    expect(routeKey("title")).toBe(`groq:${DEFAULT_MODELS.groq}`);
    process.env.AI_MODEL_GROQ = "other";
    expect(routeKey("title")).toBe("groq:other");
  });
});

describe("estimateCost", () => {
  it("prices tokens from the listed rate", () => {
    delete process.env.AI_PRICE_INPUT_PER_M;
    delete process.env.AI_PRICE_OUTPUT_PER_M;
    // 6,000 in at $0.15/M + 1,000 out at $0.75/M
    expect(estimateCost("openai/gpt-oss-120b", 6000, 1000)).toBeCloseTo(0.00165, 6);
  });

  it("returns null for an unknown model rather than guessing", () => {
    expect(estimateCost("some/unknown-model", 1000, 1000)).toBeNull();
  });

  it("uses the environment override when both prices are set", () => {
    process.env.AI_PRICE_INPUT_PER_M = "1";
    process.env.AI_PRICE_OUTPUT_PER_M = "2";
    expect(estimateCost("some/unknown-model", 1_000_000, 1_000_000)).toBe(3);
  });
});

describe("prompt versions", () => {
  it("keeps the text page features on the version their cached results were written with", () => {
    for (const feature of ["page-recommendation", "title", "meta", "heading", "content", "schema", "internal-link"] as const) {
      expect(promptVersionFor(feature)).toBe(PROMPT_VERSION);
    }
  });

  it("versions image, site and competitor prompts on their own", () => {
    expect(promptVersionFor("image-alt")).not.toBe(PROMPT_VERSION);
    expect(promptVersionFor("site-opportunity")).not.toBe(PROMPT_VERSION);
    expect(promptVersionFor("site-strategy")).not.toBe(PROMPT_VERSION);
    expect(promptVersionFor("competitor-insight")).not.toBe(PROMPT_VERSION);
  });
});
