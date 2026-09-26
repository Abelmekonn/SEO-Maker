/**
 * Competitor AI job (Phase 4.1).
 *
 *   your Site Intelligence + a competitor's crawled pages (+ SERP rows, if any)
 *     -> deterministic comparison: facts with ids (stored)
 *     -> AI interpretation, each tied to a fact id -> AiResult
 *     -> content gaps across all competitors, refreshed
 *
 * One call per competitor. Facts are stored before the model runs, so they are
 * shown even when the provider is down; interpretation is the only AI part.
 */

import {
  buildCompetitorComparison,
  competitorInsightSpec,
  loadSiteIntelligence,
  planForProject,
  runAiFeature,
  saveComparison,
  syncCompetitorGaps,
} from "@seo-maker/ai";
import type { AiCompetitorInsightJob } from "@seo-maker/core/queue";
import { prisma } from "@seo-maker/db";
import { type GenerationOutcome, settleGeneration } from "./settle.js";

export async function aiCompetitorInsightJob(job: AiCompetitorInsightJob, signal?: AbortSignal): Promise<void> {
  const outcomes: GenerationOutcome[] = [];
  try {
    await analyze(job, outcomes, signal);
  } finally {
    await settleGeneration(job.usageId, outcomes, signal);
  }
}

async function analyze(job: AiCompetitorInsightJob, outcomes: GenerationOutcome[], signal?: AbortSignal): Promise<void> {
  const loaded = await loadSiteIntelligence(job.projectId);
  if (!loaded) {
    console.warn(`AI competitor ${job.projectId}: no complete crawl of your own site yet, skipping.`);
    outcomes.push({ status: "skipped", reason: "no complete crawl" });
    return;
  }

  const competitors = await prisma.competitor.findMany({
    where: {
      projectId: job.projectId,
      excluded: false,
      status: "ready",
      ...(job.competitorId ? { id: job.competitorId } : {}),
    },
    select: { id: true, domain: true, projectId: true },
  });
  const plan = await planForProject(job.projectId);
  const business = job.mode === "deep" ? loaded.business : null;

  for (const competitor of competitors) {
    if (signal?.aborted) return;
    const comparison = await buildCompetitorComparison(competitor, loaded);
    await saveComparison(competitor.id, comparison);
    if (comparison.facts.length === 0) {
      console.log(`AI competitor ${competitor.domain}: no differences to interpret`);
      outcomes.push({ status: "skipped", reason: "no differences to interpret" });
      continue;
    }

    const spec = competitorInsightSpec(comparison, loaded.intel, business);
    const result = await runAiFeature({
      feature: spec.feature,
      mode: job.mode,
      schema: spec.schema,
      projectId: job.projectId,
      competitorId: competitor.id,
      plan,
      force: job.force,
      knowledge: spec.knowledge,
      evidence: spec.evidence,
      businessContext: business,
      buildPrompt: (knowledgeBlock: string) => spec.buildPrompt(knowledgeBlock),
      refine: spec.refine,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
      signal,
    });

    if (result.status === "failed") {
      if (result.error.kind !== "cancelled") {
        console.warn(`AI competitor ${competitor.domain}: ${result.error.kind} — ${result.error.message}`);
      }
      outcomes.push(result.error.kind === "cancelled" ? { status: "cancelled" } : { status: "failed", reason: result.error.kind });
      continue;
    }
    outcomes.push({ status: result.cached ? "cached" : "generated" });
    const latest = await prisma.competitorAnalysis.findFirst({
      where: { competitorId: competitor.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest) await prisma.competitorAnalysis.update({ where: { id: latest.id }, data: { aiUsed: true } });
    console.log(`AI competitor ${competitor.domain}: ok${result.cached ? " (cached)" : ""}`);
  }

  if (!signal?.aborted) {
    await syncCompetitorGaps(job.projectId, loaded);
  }
}
