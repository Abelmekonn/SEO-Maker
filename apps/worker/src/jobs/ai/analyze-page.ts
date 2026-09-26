/**
 * Page AI job. Queued only by a user's request, never by a crawl.
 *
 *   crawl evidence -> failing checks -> fix plan (deterministic / generate / blocked)
 *     -> page-recommendation: explain every failing check ("Analyze this page")
 *     -> one grounded generation per requested output: metadata, content,
 *        headings, schema, alt text, internal links
 *     -> validate, refine against the crawl, store as AiResult
 *
 * With no features named, the job explains the failing checks and writes a
 * fix for each one the fix plan routes to AI. With features named, it writes
 * exactly those, whether or not their check fails, as long as the page has
 * the evidence each one needs (`pageOutputAvailability`). Deterministic fixes
 * and blocked checks never reach a model.
 *
 * The usage record the request was charged to is settled at the end: charged
 * only when something new was generated.
 */

import {
  PAGE_SYSTEM_PROMPT,
  type AiImage,
  buildPageContext,
  buildSiteContext,
  imageInputAvailable,
  linkTargetCount,
  pageFeatureSpec,
  pageRecommendationSchema,
  planForProject,
  runAiFeature,
  type BusinessBlock,
  type PageContext,
  type PageFeature,
} from "@seo-maker/ai";
import { pageKeyOf } from "@seo-maker/core/crawl";
import { safeFetchBytes } from "@seo-maker/core/net";
import { PAGE_OUTPUT_FEATURES, type PageAiOutput, fixPlanInputFromPage, pageOutputAvailability, planFixes } from "@seo-maker/core/page";
import type { AiPageAnalyzeJob } from "@seo-maker/core/queue";
import { prisma } from "@seo-maker/db";
import { type GenerationOutcome, settleGeneration } from "./settle.js";

const RECOMMENDATION_SYSTEM = [
  PAGE_SYSTEM_PROMPT.replace(
    "You are the writing layer of an SEO auditing tool. You write replacement copy and fixes for one page.",
    "You are the analysis layer of an SEO auditing tool. You explain one page's failing checks.",
  ),
].join("\n");

/** Images shown to a multimodal model per request, and the size of each. */
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_TYPES = /^image\/(png|jpe?g|webp)\b/i;

/** Which output a feature belongs to, for the availability rules. */
const OUTPUT_OF: Record<PageFeature, PageAiOutput> = Object.fromEntries(
  (Object.entries(PAGE_OUTPUT_FEATURES) as Array<[PageAiOutput, string[]]>).flatMap(([output, features]) =>
    features.filter((feature) => feature !== "page-recommendation").map((feature) => [feature, output]),
  ),
) as Record<PageFeature, PageAiOutput>;

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
    "Never state rankings, traffic, keyword volumes or whether Google has indexed the page: none are in the evidence.",
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

/**
 * Downloads the images a multimodal model will look at: public addresses
 * only (every redirect hop checked), common raster formats, capped in size.
 * An image that cannot be fetched is simply not attached.
 */
async function loadImages(srcs: string[], signal?: AbortSignal): Promise<AiImage[]> {
  const images: AiImage[] = [];
  for (const src of srcs.slice(0, MAX_IMAGES)) {
    if (signal?.aborted) break;
    try {
      const response = await safeFetchBytes(src, { timeoutMs: 10_000, maxBytes: MAX_IMAGE_BYTES });
      const type = response.contentType?.split(";")[0].trim().toLowerCase() ?? "";
      if (response.status >= 400 || !IMAGE_TYPES.test(type) || response.bytes.byteLength === 0) continue;
      images.push({ mimeType: type === "image/jpg" ? "image/jpeg" : type, data: Buffer.from(response.bytes).toString("base64"), ref: src });
    } catch {
      // Unreachable, too large, or not public: described from text evidence, or skipped.
    }
  }
  return images;
}

/**
 * `signal` aborts when the user stops this project's AI work. The model call in
 * flight is cancelled, nothing is recorded for it, and no further features run.
 * Results already written stay.
 */
export async function aiAnalyzePageJob(job: AiPageAnalyzeJob, signal?: AbortSignal): Promise<void> {
  const outcomes: GenerationOutcome[] = [];
  try {
    await analyze(job, outcomes, signal);
  } finally {
    await settleGeneration(job.usageId, outcomes, signal);
  }
}

async function analyze(job: AiPageAnalyzeJob, outcomes: GenerationOutcome[], signal?: AbortSignal): Promise<void> {
  const [context, site, page, accountPlan] = await Promise.all([
    buildPageContext(job.pageId),
    buildSiteContext(job.projectId),
    prisma.page.findUnique({ where: { id: job.pageId }, include: { issues: true } }),
    planForProject(job.projectId),
  ]);
  if (!context || !site || !page) {
    console.warn(`AI page ${job.pageId}: page or project not found, skipping.`);
    outcomes.push({ status: "skipped", reason: "page or project not found" });
    return;
  }

  // Business context only in Deep mode. Quick mode must work from the page
  // alone, and the prompts say so when this is null.
  const business: BusinessBlock =
    job.mode === "deep" && site.business ? { ...site.business, siteName: site.name } : null;

  const self = page.finalUrl ?? page.url;
  const pageKey = pageKeyOf(self);
  const imageInput = imageInputAvailable("image-alt");
  const fixInput = fixPlanInputFromPage(page, linkTargetCount(site, self), { imageInput });
  const plan = planFixes(fixInput);
  const availability = pageOutputAvailability(fixInput);

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
      pageKey,
      plan: accountPlan,
      force: job.force,
      signal,
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
    outcomes.push(report(job.pageId, "page-recommendation", result));
  }
  if (signal?.aborted) return;

  // 2. Which outputs to write. Asked for by name: exactly those, when the page
  // has their evidence. Otherwise, the fixes the plan routes to AI.
  const features = new Set<PageFeature>();
  if (wantsAll) {
    for (const fix of plan) {
      if (fix.strategy === "ai-generate" && fix.feature) features.add(fix.feature as PageFeature);
    }
  } else {
    for (const feature of requested) {
      if (feature === "page-recommendation") continue;
      const output = OUTPUT_OF[feature as PageFeature];
      if (output && availability[output].available) {
        features.add(feature as PageFeature);
      } else if (output) {
        console.log(`AI page ${job.pageId} ${feature}: not written, ${availability[output].reason}`);
        outcomes.push({ status: "skipped", reason: availability[output].reason });
      }
    }
  }

  for (const feature of features) {
    if (signal?.aborted) return;

    // Alt text from the images themselves, when a provider on the route can
    // see images. Only the images that actually downloaded are offered as
    // seeable; the rest keep their text evidence, or are skipped.
    let featureContext = context;
    let images: AiImage[] | undefined;
    if (feature === "image-alt" && imageInput) {
      const fetchable = context.imagesMissingAlt.filter((image) => image.fetchable).map((image) => image.src);
      images = await loadImages(fetchable, signal);
      const attached = new Set(images.map((image) => image.ref));
      featureContext = {
        ...context,
        imagesMissingAlt: context.imagesMissingAlt
          .map((image) => ({ ...image, fetchable: attached.has(image.src) }))
          .filter((image) => image.fetchable || image.context.trim().length > 0 || Boolean(image.filename)),
      };
    } else if (feature === "image-alt") {
      featureContext = {
        ...context,
        imagesMissingAlt: context.imagesMissingAlt
          .map((image) => ({ ...image, fetchable: false }))
          .filter((image) => image.context.trim().length > 0 || Boolean(image.filename)),
      };
    }

    const spec = pageFeatureSpec(feature, featureContext, site, business);
    const result = await runAiFeature({
      feature: spec.feature,
      mode: job.mode,
      schema: spec.schema,
      projectId: job.projectId,
      pageId: job.pageId,
      pageKey,
      plan: accountPlan,
      force: job.force,
      knowledge: spec.knowledge,
      evidence: spec.evidence,
      businessContext: business,
      images,
      buildPrompt: (knowledgeBlock, _bundle, options) => spec.buildPrompt(knowledgeBlock, options),
      refine: spec.refine,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
      signal,
    });
    outcomes.push(report(job.pageId, feature, result));
  }

  const blocked = plan.filter((fix) => fix.strategy === "blocked").map((fix) => fix.checkId);
  if (blocked.length && wantsAll) {
    console.log(`AI page ${job.pageId}: not generated for lack of evidence: ${blocked.join(", ")}`);
  }
}

function report(pageId: string, feature: string, result: Awaited<ReturnType<typeof runAiFeature>>): GenerationOutcome {
  if (result.status === "failed" && result.error.kind === "cancelled") {
    console.log(`AI page ${pageId} ${feature}: stopped`);
    return { status: "cancelled" };
  }
  if (result.status === "failed") {
    // Recorded as an AiResult row by runAiFeature. Logged, not thrown: a
    // provider outage must not fail the job and trigger a retry storm.
    console.warn(`AI page ${pageId} ${feature}: ${result.error.kind} — ${result.error.message}`);
    return { status: "failed", reason: `${feature}: ${result.error.kind}` };
  }
  console.log(`AI page ${pageId} ${feature}: ok${result.cached ? " (cached)" : ""}`);
  return { status: result.cached ? "cached" : "generated" };
}
