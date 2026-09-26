/**
 * Site AI job. Queued only by a user's request, never by a crawl.
 *
 * Two tasks, both grounded in Site Intelligence rather than page bodies:
 *
 *   opportunities  latest crawl -> deterministic opportunities (stored)
 *                    -> the top ones' facts + a compact site summary
 *                    -> AI wording for each -> stored on the opportunity
 *
 *   strategy       Site Intelligence + opportunities + business context
 *                    -> content opportunities, topic structure, internal-link
 *                       strategy, site architecture, content strategy
 *                    -> AiResult (feature "site-strategy")
 *
 * The deterministic part runs first and is stored whatever the model does, so
 * a provider outage leaves every opportunity in place with its own wording.
 */

import {
  SITE_PROMPT_OPPORTUNITIES,
  applySiteOpportunityWording,
  planForProject,
  runAiFeature,
  siteOpportunitySpec,
  siteStrategySpec,
  syncSiteOpportunities,
} from "@seo-maker/ai";
import type { AiSiteAnalyzeJob } from "@seo-maker/core/queue";
import { type GenerationOutcome, settleGeneration } from "./settle.js";

export async function aiAnalyzeSiteJob(job: AiSiteAnalyzeJob, signal?: AbortSignal): Promise<void> {
  const outcomes: GenerationOutcome[] = [];
  try {
    await analyze(job, outcomes, signal);
  } finally {
    await settleGeneration(job.usageId, outcomes, signal);
  }
}

async function analyze(job: AiSiteAnalyzeJob, outcomes: GenerationOutcome[], signal?: AbortSignal): Promise<void> {
  const task = job.task ?? "opportunities";
  const synced = await syncSiteOpportunities(job.projectId);
  if (!synced) {
    console.warn(`AI site ${job.projectId}: no complete crawl yet, skipping.`);
    outcomes.push({ status: "skipped", reason: "no complete crawl" });
    return;
  }
  console.log(
    `AI site ${job.projectId}: ${synced.candidates.length} opportunities (${synced.created} new, ${synced.resolved} resolved)`,
  );
  if (signal?.aborted) return;

  // Business context only in Deep mode. Quick mode works from the crawl
  // alone, and the prompt says so when this is null.
  const business = job.mode === "deep" ? synced.loaded.business : null;
  const plan = await planForProject(job.projectId);

  if (task === "strategy") {
    const spec = siteStrategySpec(synced.loaded.intel, synced.candidates, business);
    const result = await runAiFeature({
      feature: spec.feature,
      mode: job.mode,
      schema: spec.schema,
      projectId: job.projectId,
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
        console.warn(`AI site strategy ${job.projectId}: ${result.error.kind} — ${result.error.message}`);
      }
      outcomes.push(result.error.kind === "cancelled" ? { status: "cancelled" } : { status: "failed", reason: result.error.kind });
      return;
    }
    outcomes.push({ status: result.cached ? "cached" : "generated" });
    console.log(`AI site strategy ${job.projectId}: ok${result.cached ? " (cached)" : ""}`);
    return;
  }

  if (synced.candidates.length === 0) {
    outcomes.push({ status: "skipped", reason: "no site opportunities to explain" });
    return;
  }
  const sent = synced.candidates.slice(0, SITE_PROMPT_OPPORTUNITIES);
  const spec = siteOpportunitySpec(synced.loaded.intel, sent, business);

  const result = await runAiFeature({
    feature: spec.feature,
    mode: job.mode,
    schema: spec.schema,
    projectId: job.projectId,
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
    // Recorded as an AiResult row by runAiFeature. The opportunities keep
    // their deterministic wording.
    if (result.error.kind !== "cancelled") {
      console.warn(`AI site ${job.projectId}: ${result.error.kind} — ${result.error.message}`);
    }
    outcomes.push(result.error.kind === "cancelled" ? { status: "cancelled" } : { status: "failed", reason: result.error.kind });
    return;
  }

  const applied = await applySiteOpportunityWording({
    projectId: job.projectId,
    output: result.data,
    aiResultId: result.aiResultId,
    sent,
  });
  outcomes.push({ status: result.cached ? "cached" : "generated" });
  console.log(`AI site ${job.projectId}: worded ${applied} of ${sent.length}${result.cached ? " (cached)" : ""}`);
}
