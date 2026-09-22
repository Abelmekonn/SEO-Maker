import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateStructured, parseAndValidate } from "./index";
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
