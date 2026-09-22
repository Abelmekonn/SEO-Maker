/**
 * @seo-maker/ai — the AI foundation (Phase 1).
 *
 * `runAiFeature` is the one entry point feature code uses. It owns the whole
 * path: cache lookup, knowledge retrieval, generation with retries, validation,
 * and persistence to AiResult. A feature supplies a prompt and gets validated,
 * traceable output or a recorded failure — never an unchecked model string.
 */

export * from "./config";
export * from "./provider";
export * from "./schemas";
export * from "./knowledge";
export * from "./context";
export * from "./cache";

import { prisma } from "@seo-maker/db";
import type { z } from "zod";
import {
  PROMPT_VERSION,
  loadAiConfig,
  resolveModel,
  type AiFeature,
  type AiMode,
  type Plan,
} from "./config";
import { AiError, generateStructured, type GenerateOptions } from "./provider";
import { buildInputHash, findCachedResult } from "./cache";
import { buildKnowledgeContext } from "./context";
import { retrieveKnowledge, type KnowledgeBundle, type KnowledgeQuery } from "./knowledge";

export type RunAiFeatureInput<T> = {
  feature: AiFeature;
  mode: AiMode;
  schema: z.ZodType<T>;
  projectId: string;
  pageId?: string | null;
  plan?: Plan | null;

  /** Which knowledge to retrieve. Omit to skip grounding entirely. */
  knowledge?: KnowledgeQuery;

  /**
   * Builds the user message. Receives the rendered knowledge block so the
   * prompt decides where grounding goes, rather than this module guessing.
   */
  buildPrompt: (knowledgeBlock: string, bundle: KnowledgeBundle) => { system: string; user: string };

  /** Hashed into the cache key. Must contain everything that shapes the answer. */
  evidence: unknown;
  businessContext?: unknown;

  maxTokens?: number;
  temperature?: number;
  /** Set true to bypass a cached result and regenerate. */
  force?: boolean;
  signal?: AbortSignal;
  generateOptions?: GenerateOptions;
};

export type RunAiFeatureResult<T> =
  | { status: "ok"; data: T; cached: boolean; aiResultId: string; knowledgeVersion: string | null }
  | { status: "failed"; error: AiError; aiResultId: string | null };

/**
 * Runs one grounded AI feature end to end.
 *
 * Never throws for an AI failure. A provider outage or an invalid response is a
 * recorded `failed` AiResult and a `status: "failed"` return, so a queue job can
 * finish cleanly and the UI can show why rather than surfacing a 500.
 */
export async function runAiFeature<T>(input: RunAiFeatureInput<T>): Promise<RunAiFeatureResult<T>> {
  const config = loadAiConfig();
  const model = resolveModel({ plan: input.plan, feature: input.feature, mode: input.mode }, config);

  if (!config.enabled) {
    return {
      status: "failed",
      error: new AiError("not-configured", "AI_API_KEY is not set, so AI features are disabled."),
      aiResultId: null,
    };
  }

  const bundle: KnowledgeBundle = input.knowledge
    ? await retrieveKnowledge(input.knowledge)
    : { items: [], contradictions: [], policies: [], knowledgeVersion: null };

  const inputHash = buildInputHash({
    feature: input.feature,
    mode: input.mode,
    model,
    evidence: input.evidence,
    businessContext: input.businessContext,
    knowledgeVersion: bundle.knowledgeVersion,
  });

  if (!input.force) {
    const cached = await findCachedResult(inputHash, input.feature);
    if (cached) {
      // Re-validate: a schema can tighten between runs, and a cached result that
      // no longer satisfies the contract must not be served.
      const parsed = input.schema.safeParse(cached.output);
      if (parsed.success) {
        return {
          status: "ok",
          data: parsed.data,
          cached: true,
          aiResultId: cached.id,
          knowledgeVersion: bundle.knowledgeVersion,
        };
      }
    }
  }

  const knowledgeBlock = buildKnowledgeContext(bundle);
  const { system, user } = input.buildPrompt(knowledgeBlock, bundle);

  try {
    const response = await generateStructured(
      {
        feature: input.feature,
        mode: input.mode,
        schema: input.schema,
        schemaName: input.feature,
        system,
        user,
        model,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        signal: input.signal,
      },
      input.generateOptions,
    );

    const row = await prisma.aiResult.create({
      data: {
        projectId: input.projectId,
        pageId: input.pageId ?? null,
        feature: input.feature,
        mode: input.mode,
        provider: response.provider,
        model: response.model,
        promptVersion: PROMPT_VERSION,
        knowledgeVersion: bundle.knowledgeVersion,
        inputHash,
        output: response.data as object,
        status: "ok",
        inputTokens: response.usage.input,
        outputTokens: response.usage.output,
      },
      select: { id: true },
    });

    return {
      status: "ok",
      data: response.data,
      cached: false,
      aiResultId: row.id,
      knowledgeVersion: bundle.knowledgeVersion,
    };
  } catch (error) {
    const aiError =
      error instanceof AiError
        ? error
        : new AiError("provider-error", "The AI call failed.", {
            detail: error instanceof Error ? error.message : String(error),
          });

    // A failure is a row, not a silent gap. Without it, "why is there no
    // suggestion on this page" has no answer anyone can look up.
    const row = await prisma.aiResult.create({
      data: {
        projectId: input.projectId,
        pageId: input.pageId ?? null,
        feature: input.feature,
        mode: input.mode,
        provider: config.provider,
        model,
        promptVersion: PROMPT_VERSION,
        knowledgeVersion: bundle.knowledgeVersion,
        inputHash,
        status: aiError.kind === "invalid-output" ? "invalid" : "failed",
        error: [aiError.kind, aiError.message, aiError.detail].filter(Boolean).join(" | ").slice(0, 2000),
      },
      select: { id: true },
    });

    return { status: "failed", error: aiError, aiResultId: row.id };
  }
}
