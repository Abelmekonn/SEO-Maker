/**
 * The provider interface (Phase 1.1).
 *
 * Feature code calls `generateStructured` and nothing else. No provider SDK is
 * imported outside `provider/`, so adding a second provider is a new file here
 * rather than an edit everywhere.
 */

import type { z } from "zod";
import type { AiFeature, AiMode } from "../config";

export type StructuredRequest<T> = {
  feature: AiFeature;
  mode: AiMode;
  /** Contract the response must satisfy. Invalid output is never stored. */
  schema: z.ZodType<T>;
  /** Name sent to the provider's JSON-schema mode. */
  schemaName: string;
  system: string;
  user: string;
  model: string;
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
};

export type AiProvider = {
  readonly name: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>>;
};

/**
 * Failure taxonomy (Phase 1.4).
 *
 * `retryable` is what the retry loop reads. A malformed response is retryable —
 * the model may produce valid output on a second attempt — but a 401 is not,
 * and retrying it just burns the rate limit.
 */
export type AiErrorKind =
  | "not-configured"
  | "timeout"
  | "rate-limited"
  | "auth"
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

  constructor(
    kind: AiErrorKind,
    message: string,
    options: {
      retryable?: boolean;
      status?: number | null;
      detail?: string | null;
      retryAfterMs?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.detail = options.detail ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
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
    case "cancelled":
      return false;
  }
}
