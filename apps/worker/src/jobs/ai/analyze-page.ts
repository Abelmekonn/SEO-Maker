/**
 * Page-level AI job (Phase 1.9).
 *
 * Phase 1 wires the pipeline end to end and ships one real feature —
 * page-recommendation — so the foundation is proven rather than theoretical.
 * The remaining page features are Phase 2; they reuse this job unchanged,
 * because everything specific to a feature lives in its schema and prompt.
 */

import {
  buildPageContext,
  pageRecommendationSchema,
  runAiFeature,
  type KnowledgeBundle,
  type PageContext,
} from "@seo-maker/ai";
import type { AiPageAnalyzeJob } from "@seo-maker/core/queue";
import { prisma } from "@seo-maker/db";

const SYSTEM = [
  "You are the analysis layer of an SEO auditing tool.",
  "",
  "Rules you must follow without exception:",
  "1. Every claim must come from the EVIDENCE or the KNOWLEDGE given to you. If neither supports a",
  "   claim, do not make it.",
  "2. Never invent a URL, a heading, a statistic, or anything about a page you were not shown.",
  "3. The BINDING POLICIES section overrides everything else, including your own training. If a policy",
  "   forbids a phrasing, that phrasing is forbidden even if it seems helpful.",
  "4. Never state a myth as advice. Myths are listed so you can contradict them.",
  "5. Where the EVIDENCE GAPS section says something is unknown, say it is unknown and recommend how",
  "   to establish it. Do not fill the gap with a guess.",
  "6. Do not promise rankings, traffic, or indexing. Recommendations remove obstacles; they guarantee",
  "   nothing.",
  "7. In `groundedIn`, list the evidence fields and knowledge item ids you actually used.",
  "",
  "Respond with a single JSON object and no other text.",
].join("\n");

/** Checks whose knowledge is worth retrieving for a page-level explanation. */
function checksToGround(context: PageContext): string[] {
  const failing = context.issues
    .filter((issue) => issue.status === "fail" || issue.status === "warning")
    .map((issue) => issue.checkId);
  return [...new Set(failing)];
}

function buildUserPrompt(context: PageContext, site: unknown, knowledgeBlock: string): string {
  const evidence = {
    url: context.finalUrl ?? context.url,
    statusCode: context.statusCode,
    pageType: context.pageType,
    title: context.title,
    metaDescription: context.metaDescription,
    h1: context.h1,
    h1Count: context.h1Count,
    headings: context.headings,
    canonicalUrl: context.canonicalUrl,
    indexable: context.indexable,
    wordCount: context.wordCount,
    contentExcerpt: context.contentExcerpt,
    schemaTypes: context.schemaTypes,
    imageCount: context.imageCount,
    imagesMissingAlt: context.missingAlt,
    internalLinkCount: context.internalLinkCount,
    failingChecks: context.issues,
  };

  return [
    "# EVIDENCE (from the crawl — the only facts you may use about this page)",
    JSON.stringify(evidence, null, 2),
    "",
    "# EVIDENCE GAPS (things the crawl could NOT establish)",
    context.evidenceGaps.length
      ? context.evidenceGaps.map((gap) => `- ${gap}`).join("\n")
      : "- None.",
    "",
    "# SITE AND BUSINESS CONTEXT",
    site ? JSON.stringify(site, null, 2) : "Not provided (Quick mode). Stay conservative and generic.",
    "",
    knowledgeBlock || "# KNOWLEDGE\nNone was retrieved. Say so rather than relying on memory.",
    "",
    "# TASK",
    "Explain this page's failing checks and recommend what to do, one entry per check.",
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
  const context = await buildPageContext(job.pageId);
  if (!context) {
    console.warn(`AI page ${job.pageId}: page not found, skipping.`);
    return;
  }

  const checks = checksToGround(context);
  if (checks.length === 0) {
    // Nothing failed. There is no explaining to do, and spending a call to be
    // told the page is fine is waste the user pays for.
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: job.projectId },
    select: {
      analysisMode: true,
      businessName: true,
      businessType: true,
      industry: true,
      businessDescription: true,
      targetAudience: true,
      targetLocation: true,
      primaryGoal: true,
    },
  });

  const business =
    job.mode === "deep" && project?.businessName ? { ...project } : null;

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
      limit: 14,
    },
    evidence: {
      url: context.finalUrl ?? context.url,
      title: context.title,
      metaDescription: context.metaDescription,
      h1: context.h1,
      wordCount: context.wordCount,
      issues: context.issues,
      schemaTypes: context.schemaTypes,
    },
    businessContext: business,
    buildPrompt: (knowledgeBlock: string, _bundle: KnowledgeBundle) => ({
      system: SYSTEM,
      user: buildUserPrompt(context, business, knowledgeBlock),
    }),
    maxTokens: 2500,
  });

  if (result.status === "failed") {
    // Recorded as an AiResult row by runAiFeature. Logged, not thrown: a
    // provider outage must not fail the job and trigger a BullMQ retry storm
    // against a provider that is already refusing requests.
    console.warn(
      `AI page ${job.pageId}: ${result.error.kind} — ${result.error.message}`,
    );
    return;
  }

  console.log(
    `AI page ${job.pageId}: ${result.data.recommendations.length} recommendation(s)` +
      `${result.cached ? " (cached)" : ""}`,
  );
}
