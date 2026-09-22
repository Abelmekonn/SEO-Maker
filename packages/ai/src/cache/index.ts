/**
 * Result caching (Phase 1.10).
 *
 * The cache key is a hash of everything that could change the answer: the
 * evidence, the business context, the knowledge version, the prompt version,
 * the feature, the mode and the model. Change any one and the key changes, so a
 * stale result can never be served after a re-crawl or a knowledge re-ingest.
 */

import { createHash } from "node:crypto";
import { prisma } from "@seo-maker/db";
import { PROMPT_VERSION, type AiFeature, type AiMode } from "../config";

export type CacheKeyInput = {
  feature: AiFeature;
  mode: AiMode;
  model: string;
  /** Page/site evidence that grounds the answer. */
  evidence: unknown;
  /** Business context, or null in Quick mode. */
  businessContext?: unknown;
  knowledgeVersion?: string | null;
  promptVersion?: string;
};

/**
 * Stable stringify: key order must not affect the hash, or an identical input
 * would miss the cache purely because Prisma returned columns in another order.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function buildInputHash(input: CacheKeyInput): string {
  const payload = canonical({
    feature: input.feature,
    mode: input.mode,
    model: input.model,
    promptVersion: input.promptVersion ?? PROMPT_VERSION,
    knowledgeVersion: input.knowledgeVersion ?? null,
    evidence: input.evidence,
    businessContext: input.businessContext ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export type CachedResult = {
  id: string;
  output: unknown;
  model: string;
  provider: string;
  createdAt: Date;
};

/** Returns a previous successful result for the same input, if one exists. */
export async function findCachedResult(
  inputHash: string,
  feature: AiFeature,
): Promise<CachedResult | null> {
  const row = await prisma.aiResult.findFirst({
    where: { inputHash, feature, status: "ok" },
    orderBy: { createdAt: "desc" },
    select: { id: true, output: true, model: true, provider: true, createdAt: true },
  });
  return row ?? null;
}
