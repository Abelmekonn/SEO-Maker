/**
 * The OpenAI-compatible chat completions wire format, used by Groq.
 *
 * Talks to the endpoint over `fetch`. No SDK: the surface used here is a few
 * fields of one JSON body, and a dependency-free provider is one less thing
 * to keep on a release treadmill. Provider-specific behaviour lives in the
 * subclasses (groq.ts).
 */

import type { z } from "zod";
import type { ProviderConfig } from "../config";
import { AiError, type AiProvider, type StructuredRequest, type StructuredResponse } from "./types";

type ChatChoice = {
  message?: { content?: string | null };
  finish_reason?: string;
};

type ChatResponse = {
  choices?: ChatChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string };
};

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;
  readonly supportsImages: boolean;
  protected readonly config: ProviderConfig;

  constructor(config: ProviderConfig, name: string = config.id) {
    this.config = config;
    this.name = name;
    this.supportsImages = config.supportsImages;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    if (!this.config.enabled) {
      throw new AiError("not-configured", `No API key is set for ${this.name}.`, { provider: this.name });
    }

    const started = Date.now();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.config.timeoutMs);

    // Caller cancellation and our own timeout both have to reach fetch.
    const onCallerAbort = () => timeout.abort();
    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

    const images = this.supportsImages ? (request.images ?? []) : [];
    const userContent =
      images.length > 0
        ? [
            { type: "text", text: request.user },
            ...images.map((image) => ({
              type: "image_url",
              image_url: { url: `data:${image.mimeType};base64,${image.data}` },
            })),
          ]
        : request.user;

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: timeout.signal,
        body: JSON.stringify({
          model: request.model,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 2048,
          // json_object rather than json_schema: schema support varies by
          // model, and we validate with zod afterwards regardless. The
          // contract is enforced on our side, not theirs.
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: userContent },
          ],
        }),
      });
    } catch (error) {
      if (request.signal?.aborted) {
        throw new AiError("cancelled", "The AI call was cancelled.", { provider: this.name });
      }
      if (timeout.signal.aborted) {
        throw new AiError("timeout", `${this.name} did not respond within ${this.config.timeoutMs}ms.`, { provider: this.name });
      }
      throw new AiError("provider-error", `Could not reach ${this.name}.`, {
        detail: error instanceof Error ? error.message : String(error),
        provider: this.name,
      });
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }

    const bodyText = await response.text();

    if (!response.ok) {
      throw this.classifyError(response.status, bodyText, response.headers.get("retry-after"));
    }

    let body: ChatResponse;
    try {
      body = JSON.parse(bodyText) as ChatResponse;
    } catch {
      throw new AiError("provider-error", `${this.name} returned a non-JSON body.`, {
        detail: bodyText.slice(0, 500),
        provider: this.name,
      });
    }

    const content = body.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new AiError("invalid-output", `${this.name} returned an empty message.`, {
        detail: body.choices?.[0]?.finish_reason ?? null,
        provider: this.name,
      });
    }

    const data = parseAndValidate(request.schema, content);

    return {
      data,
      raw: content,
      model: request.model,
      provider: this.name,
      usage: {
        input: body.usage?.prompt_tokens ?? null,
        output: body.usage?.completion_tokens ?? null,
      },
      latencyMs: Date.now() - started,
      attempts: 1,
      imagesSent: images.length > 0,
    };
  }

  /** Maps an HTTP failure to the error taxonomy. Subclasses add their own cases first. */
  protected classifyError(status: number, body: string, retryAfter: string | null): AiError {
    return providerError(this.name, status, body, retryAfter);
  }
}

export function providerError(provider: string, status: number, body: string, retryAfter: string | null = null): AiError {
  const detail = body.slice(0, 500);

  if (status === 401) {
    return new AiError("auth", `${provider} rejected the API key.`, { status, detail, provider });
  }

  // 403 is not the same as 401 and must not be reported as a key problem.
  // Groq returns 403 "Access denied. Please check your network settings." for
  // requests from blocked regions and datacenter/VPN IP ranges, with a valid
  // key. Saying "rejected the API key" there sends the user hunting for a
  // fault that is not in their configuration.
  if (status === 403) {
    const blocked = /network settings|access denied|not available in your/i.test(body);
    return new AiError(
      "auth",
      blocked
        ? `${provider} refused the request from this network. This usually means a blocked region, VPN or datacenter IP rather than a bad key.`
        : `${provider} denied access to this resource. The key may lack permission for this model.`,
      { status, detail, provider },
    );
  }
  // Billing: the account has no quota for this model. Retrying cannot help;
  // the next provider can.
  if (status === 402) {
    return new AiError("unavailable", `${provider} requires billing for this model on this account.`, { status, detail, provider });
  }
  if (status === 404) {
    return new AiError("unavailable", `${provider} does not offer this model to this key.`, { status, detail, provider });
  }
  // A request larger than the tier's per-minute token limit can never pass
  // there, however long it waits.
  if (status === 413) {
    return new AiError("unavailable", `The request is larger than ${provider}'s limits allow.`, { status, detail, provider });
  }
  if (status === 429) {
    return new AiError("rate-limited", `${provider} rate-limited the request.`, {
      status,
      detail,
      retryAfterMs: parseRetryAfter(retryAfter, body),
      provider,
    });
  }
  // A model that failed its own JSON mode produced unusable output; a second
  // attempt often succeeds.
  if (status === 400 && /json_validate_failed|failed to generate json|valid json/i.test(body)) {
    return new AiError("invalid-output", `${provider} could not produce valid JSON.`, { status, detail, provider });
  }
  return new AiError("provider-error", `${provider} returned ${status}.`, {
    status,
    detail,
    provider,
    retryable: status >= 500 || status === 408,
  });
}

/**
 * How long a 429 asks us to wait, in milliseconds, or null if it does not say.
 *
 * Prefers the standard `retry-after` header (seconds). Groq also states the
 * wait in the message ("Please try again in 40.5s", "in 1m2.5s", "in 500ms"),
 * and Gemini says "Please retry in 17.12s", which is the only source when
 * the header is absent.
 */
export function parseRetryAfter(header: string | null, body: string): number | null {
  const seconds = header == null ? Number.NaN : Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const match = /(?:try again|retry) in\s+((?:\d+(?:\.\d+)?(?:h|ms|m|s))+)/i.exec(body);
  if (!match) {
    return null;
  }
  let total = 0;
  for (const part of match[1].matchAll(/(\d+(?:\.\d+)?)(h|ms|m|s)/g)) {
    const value = Number(part[1]);
    const unit = part[2];
    total += unit === "h" ? value * 3_600_000 : unit === "m" ? value * 60_000 : unit === "s" ? value * 1000 : value;
  }
  return total > 0 ? Math.ceil(total) : null;
}

/**
 * Parses the model's text and checks it against the contract.
 *
 * Models wrap JSON in prose or fences often enough that a bare JSON.parse
 * throws away otherwise valid answers, so we recover the outermost object
 * before parsing. Validation itself is strict: anything the schema rejects is
 * an `invalid-output` error and is never stored.
 */
export function parseAndValidate<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, content: string): T {
  const candidate = extractJsonObject(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new AiError("invalid-output", "Model output was not valid JSON.", {
      detail: content.slice(0, 500),
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiError("invalid-output", "Model output did not match the expected contract.", {
      detail: result.error.issues
        .slice(0, 6)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
    });
  }
  return result.data;
}

/** Strips code fences and surrounding prose, returning the outermost JSON object. */
function extractJsonObject(content: string): string {
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return text;
  }
  return text.slice(start, end + 1);
}
