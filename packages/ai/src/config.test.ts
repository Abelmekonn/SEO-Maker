import { afterEach, describe, expect, it } from "vitest";
import { estimateCost, loadAiConfig, resolveModel } from "./config";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("loadAiConfig", () => {
  it("disables AI when no key is set rather than throwing", () => {
    // The crawler and deterministic scoring must boot without a provider.
    delete process.env.AI_API_KEY;
    expect(loadAiConfig().enabled).toBe(false);
  });

  it("enables AI when a key is present", () => {
    process.env.AI_API_KEY = "test-key";
    expect(loadAiConfig().enabled).toBe(true);
  });

  it("picks the base URL from the provider", () => {
    process.env.AI_PROVIDER = "openai";
    delete process.env.AI_BASE_URL;
    expect(loadAiConfig().baseUrl).toContain("api.openai.com");
  });

  it("falls back to defaults for a malformed timeout", () => {
    process.env.AI_TIMEOUT_MS = "not-a-number";
    expect(loadAiConfig().timeoutMs).toBe(45_000);
  });
});

describe("resolveModel", () => {
  it("returns the configured model by default", () => {
    process.env.AI_MODEL = "dev-model";
    delete process.env.AI_MODEL_PREMIUM;
    delete process.env.AI_MODEL_DEEP;
    expect(resolveModel({ feature: "title", mode: "quick", plan: "free" })).toBe("dev-model");
  });

  it("routes the agency plan to the premium model when one is configured", () => {
    process.env.AI_MODEL = "dev-model";
    process.env.AI_MODEL_PREMIUM = "strong-model";
    expect(resolveModel({ feature: "title", mode: "quick", plan: "agency" })).toBe("strong-model");
    expect(resolveModel({ feature: "title", mode: "quick", plan: "pro" })).toBe("dev-model");
  });

  it("leaves free plans on the development model even in deep mode", () => {
    process.env.AI_MODEL = "dev-model";
    process.env.AI_MODEL_DEEP = "deep-model";
    delete process.env.AI_MODEL_PREMIUM;
    expect(resolveModel({ feature: "title", mode: "deep", plan: "free" })).toBe("dev-model");
  });

  it("routes deep mode on a paid plan to the deep model when configured", () => {
    process.env.AI_MODEL = "dev-model";
    process.env.AI_MODEL_DEEP = "deep-model";
    delete process.env.AI_MODEL_PREMIUM;
    expect(resolveModel({ feature: "title", mode: "deep", plan: "pro" })).toBe("deep-model");
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
    delete process.env.AI_PRICE_INPUT_PER_M;
    delete process.env.AI_PRICE_OUTPUT_PER_M;
  });
});
