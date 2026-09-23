import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateStructured, OpenAiCompatibleProvider, parseAndValidate, parseRetryAfter } from "./index";
import { AiError, type AiProvider, type StructuredRequest } from "./types";

const schema = z.object({ answer: z.string(), score: z.number() });

function request(): StructuredRequest<z.infer<typeof schema>> {
  return {
    feature: "title",
    mode: "quick",
    schema,
    schemaName: "title",
    system: "s",
    user: "u",
    model: "test-model",
  };
}

const noSleep = async () => {};

function fakeProvider(
  impl: () => Promise<unknown> | never,
): AiProvider & { calls: number } {
  const provider = {
    name: "fake",
    calls: 0,
    async generateStructured<T>(): Promise<never | T> {
      provider.calls += 1;
      return (await impl()) as T;
    },
  };
  return provider as AiProvider & { calls: number };
}

describe("parseAndValidate", () => {
  it("accepts a clean JSON object", () => {
    expect(parseAndValidate(schema, '{"answer":"ok","score":1}')).toEqual({
      answer: "ok",
      score: 1,
    });
  });

  it("recovers JSON wrapped in a code fence", () => {
    const content = '```json\n{"answer":"ok","score":2}\n```';
    expect(parseAndValidate(schema, content)).toEqual({ answer: "ok", score: 2 });
  });

  it("recovers JSON surrounded by prose", () => {
    const content = 'Here you go:\n{"answer":"ok","score":3}\nHope that helps.';
    expect(parseAndValidate(schema, content)).toEqual({ answer: "ok", score: 3 });
  });

  it("rejects output that does not match the contract", () => {
    expect(() => parseAndValidate(schema, '{"answer":"ok"}')).toThrowError(AiError);
    try {
      parseAndValidate(schema, '{"answer":"ok"}');
    } catch (error) {
      expect((error as AiError).kind).toBe("invalid-output");
    }
  });

  it("rejects non-JSON output", () => {
    try {
      parseAndValidate(schema, "I could not complete that request.");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as AiError).kind).toBe("invalid-output");
    }
  });
});

describe("generateStructured retries", () => {
  it("returns on the first successful attempt", async () => {
    const provider = fakeProvider(async () => ({
      data: { answer: "a", score: 1 },
      raw: "",
      model: "test-model",
      provider: "fake",
      usage: { input: 1, output: 1 },
      latencyMs: 1,
      attempts: 1,
    }));

    const result = await generateStructured(request(), { provider, sleep: noSleep });
    expect(result.attempts).toBe(1);
    expect(provider.calls).toBe(1);
  });

  it("retries a retryable failure and reports the attempt count", async () => {
    let call = 0;
    const provider = fakeProvider(async () => {
      call += 1;
      if (call < 3) throw new AiError("rate-limited", "429");
      return {
        data: { answer: "a", score: 1 },
        raw: "",
        model: "test-model",
        provider: "fake",
        usage: { input: null, output: null },
        latencyMs: 1,
        attempts: 1,
      };
    });

    const result = await generateStructured(request(), {
      provider,
      sleep: noSleep,
      maxRetries: 3,
    });
    expect(result.attempts).toBe(3);
    expect(provider.calls).toBe(3);
  });

  it("does not retry an auth failure", async () => {
    const provider = fakeProvider(async () => {
      throw new AiError("auth", "401");
    });

    await expect(
      generateStructured(request(), { provider, sleep: noSleep, maxRetries: 3 }),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(provider.calls).toBe(1);
  });

  it("gives up after the retry budget and throws the last error", async () => {
    const provider = fakeProvider(async () => {
      throw new AiError("timeout", "slow");
    });

    await expect(
      generateStructured(request(), { provider, sleep: noSleep, maxRetries: 2 }),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(provider.calls).toBe(3);
  });

  it("wraps a non-AiError into a provider-error", async () => {
    const provider = fakeProvider(async () => {
      throw new TypeError("boom");
    });

    await expect(
      generateStructured(request(), { provider, sleep: noSleep, maxRetries: 0 }),
    ).rejects.toMatchObject({ kind: "provider-error" });
  });
});

describe("provider error classification", () => {
  const config = {
    provider: "groq",
    model: "test-model",
    apiKey: "test-key",
    baseUrl: "https://example.invalid/v1",
    timeoutMs: 5_000,
    maxRetries: 0,
    enabled: true,
  };

  async function callWith(status: number, body: string) {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(body, { status, statusText: String(status) })) as typeof fetch;
    try {
      await new OpenAiCompatibleProvider(config).generateStructured(request());
      throw new Error("should have thrown");
    } catch (error) {
      return error as InstanceType<typeof AiError>;
    } finally {
      globalThis.fetch = original;
    }
  }

  it("reports a 401 as a rejected key", async () => {
    const error = await callWith(401, '{"error":{"message":"Invalid API Key"}}');
    expect(error.kind).toBe("auth");
    expect(error.message).toMatch(/rejected the API key/i);
    expect(error.retryable).toBe(false);
  });

  it("reports a 403 network block as a network problem, not a key problem", async () => {
    // Groq answers this way for VPN and datacenter IPs with a perfectly valid
    // key. Blaming the key sends the user after a fault they do not have.
    const error = await callWith(
      403,
      '{"error":{"message":"Access denied. Please check your network settings."}}',
    );
    expect(error.kind).toBe("auth");
    expect(error.message).toMatch(/network/i);
    expect(error.message).not.toMatch(/rejected the API key/i);
    expect(error.retryable).toBe(false);
  });

  it("reports a plain 403 as a permission problem", async () => {
    const error = await callWith(403, '{"error":{"message":"model not permitted"}}');
    expect(error.message).toMatch(/permission/i);
  });

  it("reports a 429 as rate limiting, and retryable", async () => {
    const error = await callWith(429, '{"error":{"message":"slow down"}}');
    expect(error.kind).toBe("rate-limited");
    expect(error.retryable).toBe(true);
  });
});

describe("rate-limit waits", () => {
  const groq429 =
    '{"error":{"message":"Rate limit reached ... on tokens per minute (TPM): Limit 8000, Used 6957, Requested 6450. Please try again in 40.5525s. Need more tokens?"}}';

  it("reads the wait from the retry-after header first", () => {
    expect(parseRetryAfter("12", groq429)).toBe(12_000);
  });

  it("reads Groq's stated wait from the message", () => {
    expect(parseRetryAfter(null, groq429)).toBe(40_553);
    expect(parseRetryAfter(null, "Please try again in 1m2.5s.")).toBe(62_500);
    expect(parseRetryAfter(null, "Please try again in 500ms.")).toBe(500);
  });

  it("returns null when the provider does not say", () => {
    expect(parseRetryAfter(null, '{"error":{"message":"Too many requests"}}')).toBeNull();
  });

  it("waits as long as the provider asks, then succeeds", async () => {
    let calls = 0;
    const waits: number[] = [];
    const provider = fakeProvider(async () => {
      calls += 1;
      if (calls === 1) {
        throw new AiError("rate-limited", "limited", { status: 429, retryAfterMs: 40_000 });
      }
      return { data: { answer: "a", score: 1 }, raw: "", model: "m", provider: "fake", usage: { input: 1, output: 1 }, latencyMs: 1, attempts: 1 };
    });

    const result = await generateStructured(request(), {
      provider,
      maxRetries: 0,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    expect(result.data.answer).toBe("a");
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(40_000);
    expect(waits[0]).toBeLessThan(42_000);
  });

  it("stops waiting and does not call again when the caller cancels", async () => {
    const controller = new AbortController();
    const provider = fakeProvider(async () => {
      throw new AiError("rate-limited", "limited", { status: 429, retryAfterMs: 40_000 });
    });

    const pending = generateStructured(
      { ...request(), signal: controller.signal },
      // A wait that never ends on its own: only the cancellation can end it.
      { provider, sleep: () => new Promise<void>(() => {}) },
    );
    setTimeout(() => controller.abort(), 10);

    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
    expect(provider.calls).toBe(1);
  });

  it("fails straight away when the wait is longer than a job should hold a worker", async () => {
    const provider = fakeProvider(async () => {
      throw new AiError("rate-limited", "daily quota", { status: 429, retryAfterMs: 3_600_000 });
    });

    await expect(generateStructured(request(), { provider, sleep: noSleep })).rejects.toMatchObject({
      kind: "rate-limited",
    });
    expect(provider.calls).toBe(1);
  });

  it("gives up after a bounded number of rate-limit waits", async () => {
    const provider = fakeProvider(async () => {
      throw new AiError("rate-limited", "limited", { status: 429, retryAfterMs: 1_000 });
    });

    await expect(generateStructured(request(), { provider, maxRetries: 0, sleep: noSleep })).rejects.toMatchObject({
      kind: "rate-limited",
    });
    expect(provider.calls).toBe(4);
  });
});
