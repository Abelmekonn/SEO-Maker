/**
 * Page-level AI job .
 *
 * pipeline for one page:
 *
 *   crawl evidence -> failing checks -> fix plan (deterministic / generate / blocked)
 *     -> page-recommendation: explain every failing check
 *     -> one grounded generation per check the plan routes to AI
 *     -> validate, refine against the crawl, store as AiResult
 *
 * Deterministic fixes (canonical, robots, sitemap) and blocked checks never
 * reach the model: the plan already holds the answer, or says what evidence is
 * missing. Everything feature-specific lives in @seo-maker/ai's feature specs.
 */

import {
  PAGE_SYSTEM_PROMPT,
  buildPageContext,
  buildSiteContext,
  pageFeatureSpec,
  pageRecommendationSchema,
  runAiFeature,
  type BusinessBlock,
  type PageContext,
  type PageFeature,
} from "@seo-maker/ai";
import { fixPlanInputFromPage, planFixes } from "@seo-maker/core/page";
import type { AiPageAnalyzeJob } from "@seo-maker/core/queue";
import { prisma } from "@seo-maker/db";

const RECOMMENDATION_SYSTEM = [
  PAGE_SYSTEM_PROMPT.replace(
    "You are the writing layer of an SEO auditing tool. You write replacement copy and fixes for one page.",
    "You are the analysis layer of an SEO auditing tool. You explain one page's failing checks.",
  ),
].join("\n");

/** Features a user may ask for on a page even when their check passes. */
const ON_DEMAND: ReadonlySet<PageFeature> = new Set(["title", "meta"]);

function checksToGround(context: PageContext): string[] {
  return [...new Set(context.issues.map((issue) => issue.checkId))];
}

function recommendationPrompt(context: PageContext, business: BusinessBlock, knowledgeBlock: string): string {
  const evidence = {
    url: context.finalUrl ?? context.url,
    statusCode: context.statusCode,
    pageType: context.pageType,
    pageTypeConfidence: context.pageTypeConfidence,
    searchIntent: context.searchIntent,
    searchIntentConfidence: context.searchIntentConfidence,
    title: context.title,
    metaDescription: context.metaDescription,
    h1: context.h1,
    h1Count: context.h1Count,
    headings: context.headings.slice(0, 20),
    canonicalUrl: context.canonicalUrl,
    indexable: context.indexable,
    wordCount: context.wordCount,
    contentExcerpt: context.contentExcerpt?.slice(0, 2500) ?? null,
    schemaTypes: context.schemaTypes,
    imageCount: context.imageCount,
    imagesWithoutAltAttribute: context.missingAlt,
    internalLinkCount: context.internalLinkCount,
    failingChecks: context.issues,
  };

  return [
    "# EVIDENCE (from the crawl — the only facts you may use about this page)",
    JSON.stringify(evidence, null, 2),
    "",
    "# EVIDENCE GAPS (things the crawl could NOT establish)",
    context.evidenceGaps.length ? context.evidenceGaps.map((gap) => `- ${gap}`).join("\n") : "- None.",
    "",
    "# SITE AND BUSINESS CONTEXT",
    business ? JSON.stringify(business, null, 2) : "Not provided (Quick mode). Stay conservative and generic.",
    "",
    knowledgeBlock || "# KNOWLEDGE\nNone was retrieved. Say so rather than relying on memory.",
    "",
    "# TASK",
    "Explain this page's failing checks and recommend what to do, one entry per check.",
    "Images with alt=\"\" are decorative and correct; only images without an alt attribute are counted as missing.",
    "Set `actionable: false` for any recommendation that needs evidence the crawl does not have.",
    "Return JSON matching this shape:",
    "{",
    '  "summary": string,',
    '  "recommendations": [{ "checkId": string, "issue": string, "whyItMatters": string,',
    '                        "action": string, "severity": "critical"|"high"|"medium"|"low",',
    '                        "actionable": boolean }],',
    '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
    "}",
  ].join("\n");
}

export async function aiAnalyzePageJob(job: AiPageAnalyzeJob): Promise<void> {
  const [context, site, page] = await Promise.all([
    buildPageContext(job.pageId),
    buildSiteContext(job.projectId),
    prisma.page.findUnique({ where: { id: job.pageId }, include: { issues: true } }),
  ]);
  if (!context || !site || !page) {
    console.warn(`AI page ${job.pageId}: page or project not found, skipping.`);
    return;
  }

  // Business context only in Deep mode. Quick mode must work from the page
  // alone, and the prompts say so when this is null.
  const business: BusinessBlock =
    job.mode === "deep" && site.business ? { ...site.business, siteName: site.name } : null;

  const self = page.finalUrl ?? page.url;
  const plan = planFixes(
    fixPlanInputFromPage(page, site.knownUrls.filter((url) => url !== self).length),
  );

  const requested = new Set(job.features ?? []);
  const wantsAll = requested.size === 0;

  // 1. Explain every failing check.
  const checks = checksToGround(context);
  if (checks.length > 0 && (wantsAll || requested.has("page-recommendation"))) {
    const result = await runAiFeature({
      feature: "page-recommendation",
      mode: job.mode,
      schema: pageRecommendationSchema,
      projectId: job.projectId,
      pageId: job.pageId,
      force: job.force,
      knowledge: {
        checks,
        applicability: ["page_audit", "reporting_language", "myth_guard"],
        domain: "seo",
        limit: 12,
      },
      evidence: {
        url: self,
        title: context.title,
        metaDescription: context.metaDescription,
        h1: context.h1,
        wordCount: context.wordCount,
        pageType: context.pageType,
        searchIntent: context.searchIntent,
        issues: context.issues,
        schemaTypes: context.schemaTypes,
      },
      businessContext: business,
      buildPrompt: (knowledgeBlock: string) => ({
        system: RECOMMENDATION_SYSTEM,
        user: recommendationPrompt(context, business, knowledgeBlock),
      }),
      maxTokens: 2500,
    });
    report(job.pageId, "page-recommendation", result);
  }

  // 2. Generate a fix for each check the plan routes to AI. Deterministic and
  // blocked checks are answered by the plan itself and never cost a call.
  const planned = new Set(
    plan.filter((fix) => fix.strategy === "ai-generate" && fix.feature).map((fix) => fix.feature as PageFeature),
  );
  const features = new Set<PageFeature>();
  for (const feature of planned) {
    if (wantsAll || requested.has(feature)) features.add(feature);
  }
  for (const feature of requested) {
    if (ON_DEMAND.has(feature as PageFeature) && (context.contentExcerpt || context.h1)) {
      features.add(feature as PageFeature);
    }
  }

  for (const feature of features) {
    const spec = pageFeatureSpec(feature, context, site, business);
    const result = await runAiFeature({
      feature: spec.feature,
      mode: job.mode,
      schema: spec.schema,
      projectId: job.projectId,
      pageId: job.pageId,
      force: job.force,
      knowledge: spec.knowledge,
      evidence: spec.evidence,
      businessContext: business,
      buildPrompt: (knowledgeBlock: string) => spec.buildPrompt(knowledgeBlock),
      refine: spec.refine,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
    });
    report(job.pageId, feature, result);
  }

  const blocked = plan.filter((fix) => fix.strategy === "blocked").map((fix) => fix.checkId);
  if (blocked.length) {
    console.log(`AI page ${job.pageId}: not generated for lack of evidence: ${blocked.join(", ")}`);
  }
}

function report(
  pageId: string,
  feature: string,
  result: Awaited<ReturnType<typeof runAiFeature>>,
): void {
  if (result.status === "failed") {
    // Recorded as an AiResult row by runAiFeature. Logged, not thrown: a
    // provider outage must not fail the job and trigger a retry storm.
    console.warn(`AI page ${pageId} ${feature}: ${result.error.kind} — ${result.error.message}`);
    return;
  }
  console.log(`AI page ${pageId} ${feature}: ok${result.cached ? " (cached)" : ""}`);
}
