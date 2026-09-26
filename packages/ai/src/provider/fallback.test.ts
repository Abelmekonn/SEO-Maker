import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GeminiProvider,
  generateWithFallback,
  geminiError,
  setAiProvidersForTesting,
} from "./index";
import { AiError, type StructuredRequest } from "./types";

const schema = z.object({ answer: z.string(), score: z.number() });
const noSleep = async () => {};

function request(): StructuredRequest<z.infer<typeof schema>> {
  return { feature: "title", mode: "quick", schema, schemaName: "title", system: "s", user: "u", model: "m" };
}

afterEach(() => {
  setAiProvidersForTesting(null);
});

describe("Gemini error classification", () => {
  const base = {
    model: "m",
    apiKey: "k",
    baseUrl: "https://example.invalid/v1",
    timeoutMs: 5_000,
    maxRetries: 0,
    enabled: true,
    supportsImages: false,
  };

  async function fail(call: () => Promise<unknown>, status: number, body: string) {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
    try {
      await call();
      throw new Error("should have thrown");
    } catch (error) {
      return error as AiError;
    } finally {
      globalThis.fetch = original;
    }
  }

  it("runs the second Gemini account with its own key and names it in errors", async () => {
    // A quota error must trip gemini2's breaker, not the first account's.
    const original = globalThis.fetch;
    let sentKey: string | null = null;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sentKey = new Headers(init.headers).get("x-goog-api-key");
      return new Response("Quota exceeded for metric: free_tier_requests, limit: 0", { status: 429 });
    }) as typeof fetch;
    try {
      const provider = new GeminiProvider({ ...base, id: "gemini2", apiKey: "second-key" });
      expect(provider.name).toBe("gemini2");
      const error = (await provider.generateStructured(request()).catch((caught) => caught)) as AiError;
      expect(sentKey).toBe("second-key");
      expect(error.kind).toBe("unavailable");
      expect(error.provider).toBe("gemini2");
      expect(error.message).toContain("gemini2");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reads Gemini's invalid key, tier and overload errors", () => {
    expect(geminiError(400, '{"error":{"message":"API key not valid.","details":[{"reason":"API_KEY_INVALID"}]}}').kind).toBe("auth");
    expect(geminiError(429, "Quota exceeded for metric: free_tier_requests, limit: 0, model: gemini-3.1-pro").kind).toBe(
      "unavailable",
    );
    const limited = geminiError(429, '{"error":{"message":"Please retry in 17.1s.","status":"RESOURCE_EXHAUSTED"}}');
    expect(limited.kind).toBe("rate-limited");
    expect(limited.retryAfterMs).toBe(17_100);
    const overloaded = geminiError(503, '{"error":{"status":"UNAVAILABLE","message":"high demand"}}');
    expect(overloaded.kind).toBe("provider-error");
    expect(overloaded.retryable).toBe(true);
  });

  it("rejects a Gemini answer that ran out of tokens instead of storing half a JSON object", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":"cut' }] }, finishReason: "MAX_TOKENS" }] }),
        { status: 200 },
      )) as typeof fetch;
    try {
      await expect(new GeminiProvider({ ...base, id: "gemini" }).generateStructured(request())).rejects.toMatchObject({
        kind: "invalid-output",
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("sends images to Gemini as inline parts", async () => {
    const original = globalThis.fetch;
    let sent = "";
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      sent = String(init?.body);
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":"a","score":1}' }] }, finishReason: "STOP" }] }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const provider = new GeminiProvider({ ...base, id: "gemini", supportsImages: true });
      const result = await provider.generateStructured({
        ...request(),
        images: [{ mimeType: "image/png", data: "AAAA", ref: "https://x.com/a.png" }],
      });
      expect(result.imagesSent).toBe(true);
      expect(sent).toContain('"inlineData":{"mimeType":"image/png","data":"AAAA"}');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("generateWithFallback", () => {
  const ok = (provider: string) => ({
    data: { answer: provider, score: 1 },
    raw: "",
    model: "m",
    provider,
    usage: { input: 1, output: 1 },
    latencyMs: 1,
    attempts: 1,
  });

  function withProviders(impls: Record<string, () => Promise<unknown>>, images: Record<string, boolean> = {}) {
    const calls: string[] = [];
    setAiProvidersForTesting((id) => ({
      name: id,
      supportsImages: images[id] ?? false,
      async generateStructured<T>() {
        calls.push(id);
        const impl = impls[id];
        if (!impl) throw new AiError("not-configured", "no fake");
        return (await impl()) as T;
      },
    }));
    return calls;
  }

  const routes = [
    { provider: "gemini2" as const, model: "c" },
    { provider: "gemini" as const, model: "g" },
    { provider: "groq" as const, model: "q" },
  ];
  const fallbackRequest = {
    feature: "site-strategy" as const,
    mode: "quick" as const,
    schema,
    schemaName: "site-strategy",
    prompt: () => ({ system: "s", user: "u" }),
  };

  it("moves to the next provider when the routed one has no quota", async () => {
    const calls = withProviders({
      gemini2: async () => {
        throw new AiError("unavailable", "no quota");
      },
      gemini: async () => ok("gemini"),
    });
    const result = await generateWithFallback(fallbackRequest, routes, { sleep: noSleep });
    expect(result.data.answer).toBe("gemini");
    expect(result.fallbackFrom).toEqual(["gemini2"]);
    expect(calls).toEqual(["gemini2", "gemini"]);
  });

  it("skips a provider that failed for good on an earlier call", async () => {
    const calls = withProviders({
      gemini2: async () => {
        throw new AiError("unavailable", "no quota");
      },
      gemini: async () => ok("gemini"),
    });
    await generateWithFallback(fallbackRequest, routes, { sleep: noSleep });
    await generateWithFallback(fallbackRequest, routes, { sleep: noSleep });
    // gemini2 is tried once, then its breaker holds it out of the second call.
    expect(calls).toEqual(["gemini2", "gemini", "gemini"]);
  });

  it("retries a transient failure on the same provider before falling back", async () => {
    let attempts = 0;
    const calls = withProviders({
      gemini2: async () => {
        attempts += 1;
        if (attempts < 2) throw new AiError("provider-error", "503");
        return ok("gemini2");
      },
    });
    const result = await generateWithFallback(fallbackRequest, routes, { sleep: noSleep, maxRetries: 2 });
    expect(result.provider).toBe("gemini2");
    expect(calls).toEqual(["gemini2", "gemini2"]);
  });

  it("reports every provider's failure when all of them fail", async () => {
    withProviders({
      gemini2: async () => {
        throw new AiError("unavailable", "no quota");
      },
      gemini: async () => {
        throw new AiError("auth", "bad key");
      },
      groq: async () => {
        throw new AiError("timeout", "slow");
      },
    });
    const error = (await generateWithFallback(fallbackRequest, routes, { sleep: noSleep, maxRetries: 0 }).catch(
      (caught) => caught,
    )) as AiError;
    expect(error.kind).toBe("unavailable");
    expect(error.detail).toMatch(/gemini2.*gemini.*groq/);
  });

  it("never falls back after the user cancels", async () => {
    const controller = new AbortController();
    controller.abort();
    const calls = withProviders({ gemini2: async () => ok("gemini2") });
    await expect(
      generateWithFallback({ ...fallbackRequest, signal: controller.signal }, routes, { sleep: noSleep }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(calls).toEqual([]);
  });

  it("builds the prompt for whether images actually reach the model", async () => {
    const prompts: boolean[] = [];
    withProviders(
      {
        gemini: async () => {
          throw new AiError("unavailable", "down");
        },
        groq: async () => ok("groq"),
      },
      { gemini: true },
    );
    const result = await generateWithFallback(
      {
        ...fallbackRequest,
        images: [{ mimeType: "image/png", data: "AAAA", ref: "a" }],
        prompt: (imagesAttached) => {
          prompts.push(imagesAttached);
          return { system: "s", user: "u" };
        },
      },
      [
        { provider: "gemini", model: "g" },
        { provider: "groq", model: "q" },
      ],
      { sleep: noSleep },
    );
    expect(prompts).toEqual([true, false]);
    expect(result.imagesSent).toBe(false);
  });

  it("refuses to run without any configured provider", async () => {
    await expect(generateWithFallback(fallbackRequest, [], { sleep: noSleep })).rejects.toMatchObject({
      kind: "not-configured",
    });
  });
});
