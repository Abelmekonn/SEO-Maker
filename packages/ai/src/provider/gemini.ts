/**
 * Gemini: the native generateContent API.
 *
 * Native rather than Gemini's OpenAI-compatible endpoint because it takes
 * images as inline parts and reports thinking tokens separately. JSON mode
 * (`responseMimeType: application/json`) and image input were verified on the
 * default model before this was written.
 *
 * Gemini's current flash models think before answering, and thinking tokens
 * count against `maxOutputTokens`: with the default settings a 300-token
 * budget was spent entirely on thinking and the JSON came back cut off. So
 * the thinking level is set explicitly (AI_GEMINI_THINKING) and the output
 * budget gets headroom for it.
 *
 * One class serves both Gemini accounts (`gemini` and `gemini2`); each
 * instance is named after its config id, so errors, logs and results say
 * which account answered.
 */

import type { ProviderConfig } from "../config";
import { parseAndValidate, parseRetryAfter } from "./openai-compatible";
import { AiError, type AiProvider, type StructuredRequest, type StructuredResponse } from "./types";

type GeminiPart = { text?: string; thought?: boolean };

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

type ThinkingLevel = "minimal" | "low" | "medium" | "high";

/** Output tokens added on top of the request's budget for the model's thinking. */
const THINKING_HEADROOM: Record<ThinkingLevel, number> = { minimal: 256, low: 3072, medium: 6144, high: 12288 };

/** Gemini 2.x takes a token budget instead of a level. */
const THINKING_BUDGET_2X: Record<ThinkingLevel, number> = { minimal: 0, low: 1024, medium: 4096, high: 8192 };

function thinkingLevel(): ThinkingLevel {
  const value = process.env.AI_GEMINI_THINKING?.trim().toLowerCase();
  return value === "minimal" || value === "low" || value === "medium" || value === "high" ? value : "low";
}

export class GeminiProvider implements AiProvider {
  readonly name: string;
  readonly supportsImages: boolean;
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.name = config.id;
    this.supportsImages = config.supportsImages;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    if (!this.config.enabled) {
      throw new AiError("not-configured", `No API key is set for ${this.name}.`, { provider: this.name });
    }

    const started = Date.now();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.config.timeoutMs);
    const onCallerAbort = () => timeout.abort();
    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

    const level = thinkingLevel();
    const legacy = /^gemini-2\./.test(request.model);
    const images = this.supportsImages ? (request.images ?? []) : [];

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.config.apiKey },
        signal: timeout.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: request.user },
                ...images.flatMap((image) => [
                  { text: `Image ${image.ref}:` },
                  { inlineData: { mimeType: image.mimeType, data: image.data } },
                ]),
              ],
            },
          ],
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: (request.maxTokens ?? 2048) + THINKING_HEADROOM[level],
            responseMimeType: "application/json",
            thinkingConfig: legacy ? { thinkingBudget: THINKING_BUDGET_2X[level] } : { thinkingLevel: level },
          },
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
      throw geminiError(response.status, bodyText, response.headers.get("retry-after"), this.name);
    }

    let body: GeminiResponse;
    try {
      body = JSON.parse(bodyText) as GeminiResponse;
    } catch {
      throw new AiError("provider-error", `${this.name} returned a non-JSON body.`, { detail: bodyText.slice(0, 500), provider: this.name });
    }

    if (body.promptFeedback?.blockReason) {
      throw new AiError("invalid-output", `${this.name} declined the prompt.`, {
        detail: body.promptFeedback.blockReason,
        retryable: false,
        provider: this.name,
      });
    }

    const candidate = body.candidates?.[0];
    const content = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    if (!content.trim()) {
      throw new AiError("invalid-output", `${this.name} returned an empty message.`, {
        detail: candidate?.finishReason ?? null,
        provider: this.name,
      });
    }
    if (candidate?.finishReason === "MAX_TOKENS") {
      // Cut off mid-answer: the JSON cannot be complete. A retry usually
      // thinks less and fits.
      throw new AiError("invalid-output", `${this.name} ran out of output tokens before finishing.`, {
        detail: content.slice(-200),
        provider: this.name,
      });
    }

    const data = parseAndValidate(request.schema, content);
    const usage = body.usageMetadata;
    return {
      data,
      raw: content,
      model: request.model,
      provider: this.name,
      usage: {
        input: usage?.promptTokenCount ?? null,
        // Thinking is billed as output.
        output: usage ? (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) : null,
      },
      latencyMs: Date.now() - started,
      attempts: 1,
      imagesSent: images.length > 0,
    };
  }
}

/** Maps a Gemini error response to the taxonomy. */
export function geminiError(status: number, body: string, retryAfter: string | null = null, provider = "gemini"): AiError {
  const detail = body.slice(0, 500);

  if (/API_KEY_INVALID|API key not valid/i.test(body) || status === 401) {
    return new AiError("auth", `${provider} rejected the API key.`, { status, detail, provider });
  }
  if (status === 403) {
    return new AiError("auth", `${provider} denied access to this model for this key.`, { status, detail, provider });
  }
  if (status === 404) {
    return new AiError("unavailable", `${provider} does not offer this model to this key.`, { status, detail, provider });
  }
  if (status === 429) {
    // "limit: 0" means the model is not on this key's tier at all.
    if (/limit:\s*0\b/.test(body)) {
      return new AiError("unavailable", `This ${provider} model is not included in the key's tier.`, { status, detail, provider });
    }
    // A per-day quota does not clear in seconds, whatever the retry hint says.
    const perDay = /PerDay/i.test(body);
    return new AiError("rate-limited", `${provider} rate-limited the request.`, {
      status,
      detail,
      provider,
      retryAfterMs: perDay ? 60 * 60 * 1000 : (parseRetryAfter(retryAfter, body) ?? retryDelayFromDetails(body)),
    });
  }
  return new AiError("provider-error", `${provider} returned ${status}.`, {
    status,
    detail,
    provider,
    // 500 INTERNAL and 503 UNAVAILABLE ("high demand") are transient.
    retryable: status >= 500,
  });
}

/** google.rpc.RetryInfo's retryDelay, e.g. "17s". */
function retryDelayFromDetails(body: string): number | null {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}
