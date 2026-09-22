/**
 * Groq provider (Phase 1.1).
 *
 * Talks to Groq's OpenAI-compatible chat completions endpoint over `fetch`.
 * No SDK: the surface used here is three fields of one JSON body, and a
 * dependency-free provider is one less thing to keep on a release treadmill.
 * The same class serves any OpenAI-compatible endpoint via AI_BASE_URL.
 */

import { z } from "zod";
import type { AiConfig } from "../config";
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
  private readonly config: AiConfig;

  constructor(config: AiConfig, name = config.provider) {
    this.config = config;
    this.name = name;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    if (!this.config.enabled) {
      throw new AiError("not-configured", "AI_API_KEY is not set, so AI features are disabled.");
    }

    const started = Date.now();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.config.timeoutMs);

    // Caller cancellation and our own timeout both have to reach fetch.
    const onCallerAbort = () => timeout.abort();
    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

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
          // json_object rather than json_schema: Groq's schema support varies by
          // model, and we validate with zod afterwards regardless. The contract
          // is enforced on our side, not theirs.
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      });
    } catch (error) {
      if (request.signal?.aborted) {
        throw new AiError("cancelled", "The AI call was cancelled.");
      }
      if (timeout.signal.aborted) {
        throw new AiError("timeout", `Provider did not respond within ${this.config.timeoutMs}ms.`);
      }
      throw new AiError("provider-error", "Could not reach the AI provider.", {
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }

    const bodyText = await response.text();

    if (!response.ok) {
      throw providerError(response.status, bodyText);
    }

    let body: ChatResponse;
    try {
      body = JSON.parse(bodyText) as ChatResponse;
    } catch {
      throw new AiError("provider-error", "Provider returned a non-JSON body.", {
        detail: bodyText.slice(0, 500),
      });
    }

    const content = body.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new AiError("invalid-output", "Provider returned an empty message.", {
        detail: body.choices?.[0]?.finish_reason ?? null,
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
    };
  }
}

function providerError(status: number, body: string): AiError {
  const detail = body.slice(0, 500);
  if (status === 401 || status === 403) {
    return new AiError("auth", "The AI provider rejected the API key.", { status, detail });
  }
  if (status === 429) {
    return new AiError("rate-limited", "The AI provider rate-limited the request.", { status, detail });
  }
  return new AiError("provider-error", `The AI provider returned ${status}.`, { status, detail });
}

/**
 * Parses the model's text and checks it against the contract (Phase 1.3).
 *
 * Models wrap JSON in prose or fences often enough that a bare JSON.parse
 * throws away otherwise valid answers, so we recover the outermost object
 * before parsing. Validation itself is strict: anything the schema rejects is
 * an `invalid-output` error and is never stored.
 */
export function parseAndValidate<T>(schema: z.ZodType<T>, content: string): T {
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
