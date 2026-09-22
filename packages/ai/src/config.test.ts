import { afterEach, describe, expect, it } from "vitest";
import { loadAiConfig, resolveModel } from "./config";

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

  it("routes premium plans to the premium model when one is configured", () => {
    process.env.AI_MODEL = "dev-model";
    process.env.AI_MODEL_PREMIUM = "strong-model";
    expect(resolveModel({ feature: "title", mode: "quick", plan: "premium" })).toBe("strong-model");
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
