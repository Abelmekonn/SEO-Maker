/**
 * The provider interface.
 *
 * Feature code never talks to a provider: it calls `runAiFeature`, which
 * routes through `generateWithFallback`. No provider SDK is imported outside
 * `provider/`, so adding a provider is a new file here rather than an edit
 * everywhere.
 */

import type { z } from "zod";
import type { AiFeature, AiMode, ProviderId } from "../config";

/** An image the model may look at. Only sent to providers that accept images. */
export type AiImage = {
  mimeType: string;
  /** Base64 bytes. */
  data: string;
  /** How the prompt refers to it (its src), so the answer can name it. */
  ref: string;
};

export type StructuredRequest<T> = {
  feature: AiFeature;
  mode: AiMode;
  /** Contract the response must satisfy. Invalid output is never stored. */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** Name sent to the provider's JSON mode. */
  schemaName: string;
  system: string;
  user: string;
  model: string;
  /** Attached after the user message. Ignored by a provider that cannot see images. */
  images?: AiImage[];
  maxTokens?: number;
  temperature?: number;
  /** Aborts the call when the caller is shutting down. */
  signal?: AbortSignal;
};

export type TokenUsage = {
  input: number | null;
  output: number | null;
};

export type StructuredResponse<T> = {
  data: T;
  raw: string;
  model: string;
  provider: string;
  usage: TokenUsage;
  /** Wall time for the provider call, milliseconds. */
  latencyMs: number;
  /** How many attempts it took, including the successful one. */
  attempts: number;
  /** Providers that were tried first and failed, when this is a fallback answer. */
  fallbackFrom?: ProviderId[];
  /** Whether the images in the request reached the model. */
  imagesSent?: boolean;
};

export type AiProvider = {
  readonly name: string;
  /** Whether the model this provider runs accepts image input. */
  readonly supportsImages?: boolean;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>>;
};

/**
 * Failure taxonomy.
 *
 * `retryable` is what the retry loop reads. A malformed response is retryable
 * (the model may produce valid output on a second attempt) but a 401 is not,
 * and retrying it just burns the rate limit. Every kind except `cancelled`
 * moves on to the next provider once retries are spent.
 */
export type AiErrorKind =
  | "not-configured"
  | "timeout"
  | "rate-limited"
  | "auth"
  /** The account cannot use this model: billing (402), a retired or unknown model (404). */
  | "unavailable"
  | "provider-error"
  | "invalid-output"
  | "cancelled";

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly retryable: boolean;
  readonly status: number | null;
  /** Provider response body or validation detail, for the AiResult.error column. */
  readonly detail: string | null;
  /** How long the provider asked us to wait before retrying, when it said. */
  readonly retryAfterMs: number | null;
  /** The provider that raised it, when known. */
  readonly provider: string | null;

  constructor(
    kind: AiErrorKind,
    message: string,
    options: {
      retryable?: boolean;
      status?: number | null;
      detail?: string | null;
      retryAfterMs?: number | null;
      provider?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.detail = options.detail ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.provider = options.provider ?? null;
    this.retryable = options.retryable ?? defaultRetryable(kind);
  }
}

function defaultRetryable(kind: AiErrorKind): boolean {
  switch (kind) {
    case "timeout":
    case "rate-limited":
    case "provider-error":
    case "invalid-output":
      return true;
    case "not-configured":
    case "auth":
    case "unavailable":
    case "cancelled":
      return false;
  }
}
