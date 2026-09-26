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
export * from "./features/page";
export * from "./features/site";
export * from "./features/site-strategy";
export * from "./features/competitor";
export * from "./features/grounding";
export * from "./features/search-queries";
export * from "./site/sync";
export * from "./competitors/sync";
export * from "./competitors/context";
export * from "./competitors/queries";
export * from "./competitors/evidence";
export * from "./competitors/analysis";
export * from "./competitors/discovery";

import { prisma } from "@seo-maker/db";
import type { z } from "zod";
import {
  estimateCost,
  promptVersionFor,
  loadAiConfig,
  primaryProviderFor,
  routeKey,
  routesFor,
  type AiFeature,
  type AiMode,
  type Plan,
} from "./config";
import { AiError, type AiImage, type GenerateOptions, generateWithFallback } from "./provider";
import { buildInputHash, findCachedResult } from "./cache";
import { buildKnowledgeContext } from "./context";
import { retrieveKnowledge, type KnowledgeBundle, type KnowledgeQuery } from "./knowledge";

export type RunAiFeatureInput<T> = {
  feature: AiFeature;
  mode: AiMode;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  projectId: string;
  pageId?: string | null;
  /** The page's URL identity (pageKeyOf). Page results are read by it. */
  pageKey?: string | null;
  /** The competitor a competitor-level result is about. */
  competitorId?: string | null;
  plan?: Plan | null;

  /** Which knowledge to retrieve. Omit to skip grounding entirely. */
  knowledge?: KnowledgeQuery;

  /**
   * Builds the prompt. Receives the rendered knowledge block so the prompt
   * decides where grounding goes, rather than this module guessing, and
   * whether `images` will reach the model: a provider that cannot see images
   * gets a prompt that does not mention them.
   */
  buildPrompt: (
    knowledgeBlock: string,
    bundle: KnowledgeBundle,
    options: { imagesAttached: boolean },
  ) => { system: string; user: string };

  /** Images for a provider that accepts them (alt text from the image itself). */
  images?: AiImage[];

  /** Hashed into the cache key. Must contain everything that shapes the answer. */
  evidence: unknown;
  businessContext?: unknown;

  maxTokens?: number;
  temperature?: number;
  /** Set true to bypass a cached result and regenerate. */
  force?: boolean;
  /**
   * Checks the schema cannot express, run after validation and before storage:
   * "every link target is a crawled URL", "the JSON-LD names schema.org". May
   * also trim the output (drop the one invented target, keep the rest). A
   * failure is recorded as an invalid result, never stored as output.
   */
  refine?: (data: T, context: { imagesSent: boolean }) => { ok: true; data: T } | { ok: false; reason: string };
  signal?: AbortSignal;
  generateOptions?: Omit<GenerateOptions, "provider">;
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
  const routes = routesFor(input.feature, config);
  // The cache key names the routed provider and model, whichever provider
  // ends up answering, so a configuration change never serves a stale entry.
  const model = routeKey(input.feature, config);
  const primary = primaryProviderFor(input.feature, config);

  if (!config.enabled || routes.length === 0) {
    return {
      status: "failed",
      error: new AiError("not-configured", "No AI provider is configured, so AI features are disabled."),
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
      const refined = parsed.success
        ? input.refine
          ? input.refine(parsed.data, { imagesSent: false })
          : { ok: true as const, data: parsed.data }
        : null;
      if (refined?.ok) {
        // A hit from another page row (an earlier crawl of this page, or the
        // same page in another project) is recorded for this one: the input is
        // identical, so the answer holds, and without a row of its own this
        // page would read as not analysed. No tokens are spent.
        const reused =
          cached.pageId === (input.pageId ?? null) &&
          cached.projectId === input.projectId &&
          cached.competitorId === (input.competitorId ?? null)
            ? cached.id
            : (
                await prisma.aiResult.create({
                  data: {
                    projectId: input.projectId,
                    pageId: input.pageId ?? null,
                    pageKey: input.pageKey ?? null,
                    competitorId: input.competitorId ?? null,
                    feature: input.feature,
                    mode: input.mode,
                    provider: cached.provider,
                    model: cached.model,
                    promptVersion: cached.promptVersion,
                    knowledgeVersion: cached.knowledgeVersion,
                    inputHash,
                    output: cached.output as object,
                    status: "ok",
                    inputTokens: 0,
                    outputTokens: 0,
                    estimatedCost: 0,
                  },
                  select: { id: true },
                })
              ).id;
        return {
          status: "ok",
          data: refined.data,
          cached: true,
          aiResultId: reused,
          knowledgeVersion: bundle.knowledgeVersion,
        };
      }
    }
  }

  const knowledgeBlock = buildKnowledgeContext(bundle);

  if (input.signal?.aborted) {
    return { status: "failed", error: new AiError("cancelled", "The AI call was cancelled."), aiResultId: null };
  }

  try {
    const response = await generateWithFallback(
      {
        feature: input.feature,
        mode: input.mode,
        schema: input.schema,
        schemaName: input.feature,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        signal: input.signal,
        images: input.images,
        prompt: (imagesAttached) => input.buildPrompt(knowledgeBlock, bundle, { imagesAttached }),
      },
      routes,
      { ...input.generateOptions, config },
    );

    let data = response.data;
    if (input.refine) {
      const refined = input.refine(data, { imagesSent: Boolean(response.imagesSent) });
      if (!refined.ok) {
        throw new AiError("invalid-output", "Model output failed a grounding check.", {
          detail: refined.reason,
          retryable: false,
        });
      }
      data = refined.data;
    }

    const row = await prisma.aiResult.create({
      data: {
        projectId: input.projectId,
        pageId: input.pageId ?? null,
        pageKey: input.pageKey ?? null,
        competitorId: input.competitorId ?? null,
        feature: input.feature,
        mode: input.mode,
        provider: response.provider,
        model: response.model,
        promptVersion: promptVersionFor(input.feature),
        knowledgeVersion: bundle.knowledgeVersion,
        inputHash,
        output: data as object,
        status: "ok",
        inputTokens: response.usage.input,
        outputTokens: response.usage.output,
        estimatedCost: estimateCost(response.model, response.usage.input, response.usage.output),
      },
      select: { id: true },
    });

    return {
      status: "ok",
      data,
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

    // A user stopping the work is not a failure of the page. Recording it
    // would show "AI failed" on a page nobody asked to finish.
    if (aiError.kind === "cancelled") {
      return { status: "failed", error: aiError, aiResultId: null };
    }

    // A failure is a row, not a silent gap. Without it, "why is there no
    // suggestion on this page" has no answer anyone can look up.
    const row = await prisma.aiResult.create({
      data: {
        projectId: input.projectId,
        pageId: input.pageId ?? null,
        pageKey: input.pageKey ?? null,
        competitorId: input.competitorId ?? null,
        feature: input.feature,
        mode: input.mode,
        provider: primary,
        model: config.providers[primary].model,
        promptVersion: promptVersionFor(input.feature),
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
