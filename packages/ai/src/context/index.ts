/**
 * Context builders (Phase 1.8).
 *
 * Prompts receive context objects; prompts never query Prisma. Everything a
 * prompt is allowed to state about a page or a site is assembled here, so the
 * set of facts the model can see is reviewable in one place.
 *
 * Nothing in here invents a value. A field the crawl did not capture is null,
 * and `evidenceGaps` names it explicitly so the prompt can instruct the model
 * to say "not enough evidence" rather than guess.
 */

import { prisma } from "@seo-maker/db";
import { type PageEvidence, describableMissingAltImages } from "@seo-maker/core/page";
import type { KnowledgeBundle } from "../knowledge";

export type PageContext = {
  pageId: string;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  pageType: string | null;
  pageTypeConfidence: number | null;
  /** Phase 2.5, inferred from type and wording, with its confidence. */
  searchIntent: string | null;
  searchIntentConfidence: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  h1Count: number | null;
  headings: { level: number; text: string }[];
  canonicalUrl: string | null;
  indexable: boolean | null;
  robotsMeta: string | null;
  language: string | null;
  wordCount: number | null;
  /** Trimmed page text. Never the whole document. */
  contentExcerpt: string | null;
  imageCount: number | null;
  missingAlt: number | null;
  /** Only images we can actually describe, per Phase 0.3. */
  imagesWithContext: { src: string; alt: string | null; context: string }[];
  /**
   * Images with no alt attribute that carry a caption, nearby text or a
   * filename: the only ones an alt suggestion may be written for.
   */
  imagesMissingAlt: { src: string; filename: string | null; context: string }[];
  internalLinkCount: number | null;
  outgoingLinks: { href: string; anchor: string }[];
  schemaTypes: string[];
  /** Failing and warning deterministic checks, the reason AI was invoked. */
  issues: {
    checkId: string;
    status: string;
    severity: string;
    message: string;
    evidence: string | null;
  }[];
  /** Named so the prompt can require honesty instead of invention. */
  evidenceGaps: string[];
};

export type SiteContext = {
  projectId: string;
  rootUrl: string;
  name: string;
  analysisMode: string;
  /** Null in Quick mode. The prompt must then stay conservative. */
  business: {
    name: string | null;
    type: string | null;
    industry: string | null;
    description: string | null;
    targetAudience: string | null;
    targetLocation: string | null;
    servicesProducts: unknown;
    primaryGoal: string | null;
    targetKeywords: unknown;
  } | null;
  pageCount: number;
  /** URLs the crawl actually found. Internal-link suggestions must come from here. */
  knownUrls: string[];
  /** The same pages with their titles, so link suggestions can match on topic. */
  knownPages: { url: string; title: string | null; pageType: string | null }[];
};

const CONTENT_EXCERPT_CHARS = 6_000;
const MAX_LINKS_IN_CONTEXT = 40;
const MAX_IMAGES_IN_CONTEXT = 15;

export async function buildPageContext(pageId: string): Promise<PageContext | null> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { issues: true },
  });
  if (!page) return null;

  const evidence = (page.evidence ?? null) as PageEvidence | null;

  const imagesWithContext = (evidence?.images ?? [])
    // Phase 0.3: an image we cannot describe must not produce invented alt text.
    // Only images carrying real surrounding context are offered to the model.
    .filter((image) => image.context.trim().length > 0 || image.filename)
    .slice(0, MAX_IMAGES_IN_CONTEXT)
    .map((image) => ({ src: image.src, alt: image.alt, context: image.context }));

  const outgoingLinks = (evidence?.links ?? [])
    .filter((link) => link.internal && link.anchor.trim().length > 0)
    .slice(0, MAX_LINKS_IN_CONTEXT)
    .map((link) => ({ href: link.href, anchor: link.anchor }));

  const schemaTypes = [...new Set((evidence?.schema ?? []).flatMap((block) => block.types))];

  const imagesMissingAlt = describableMissingAltImages(evidence)
    .slice(0, MAX_IMAGES_IN_CONTEXT)
    .map((image) => ({ src: image.src, filename: image.filename, context: image.context }));

  const context: PageContext = {
    pageId: page.id,
    url: page.url,
    finalUrl: page.finalUrl,
    statusCode: page.statusCode,
    pageType: page.pageType,
    pageTypeConfidence: page.pageTypeScore,
    searchIntent: page.searchIntent,
    searchIntentConfidence: page.searchIntentScore,
    title: page.title,
    metaDescription: page.metaDesc,
    h1: page.h1,
    h1Count: page.h1Count,
    headings: evidence?.headings ?? [],
    canonicalUrl: page.canonicalUrl,
    indexable: page.indexable,
    robotsMeta: page.robotsMeta,
    language: page.language,
    wordCount: page.wordCount,
    contentExcerpt: page.content ? page.content.slice(0, CONTENT_EXCERPT_CHARS) : null,
    imageCount: page.imageCount,
    missingAlt: page.missingAlt,
    imagesWithContext,
    imagesMissingAlt,
    internalLinkCount: page.internalLinks,
    outgoingLinks,
    schemaTypes,
    issues: page.issues.map((issue) => ({
      checkId: issue.checkId,
      status: issue.status,
      severity: issue.severity,
      message: issue.message,
      evidence: issue.evidence,
    })),
    evidenceGaps: [],
  };

  context.evidenceGaps = findEvidenceGaps(context, page.missingAlt ?? 0, imagesWithContext.length);
  return context;
}

/**
 * Names what the crawl could not establish.
 *
 * This list goes into the prompt verbatim. It is what turns "the model invented
 * an answer" into "the model reported it lacked the evidence".
 */
function findEvidenceGaps(
  context: PageContext,
  missingAlt: number,
  describableImages: number,
): string[] {
  const gaps: string[] = [];

  if (!context.contentExcerpt) {
    gaps.push("Page text was not captured, so no content-based claim can be made.");
  }
  if (context.title === null) {
    gaps.push("The page has no title element.");
  }
  if (context.headings.length === 0) {
    gaps.push("No H2/H3 headings were captured, so page structure is unknown.");
  }
  if (missingAlt > 0 && describableImages === 0) {
    gaps.push(
      `${missingAlt} image(s) lack alt text and none carry usable surrounding context. ` +
        "Alt text must not be generated for these; recommend human review instead.",
    );
  }
  if (context.pageType === null) {
    gaps.push("Page type is unknown, so type-specific advice cannot be given.");
  }
  if (context.schemaTypes.length === 0) {
    gaps.push("No structured data was found on the page.");
  }
  return gaps;
}

export async function buildSiteContext(projectId: string): Promise<SiteContext | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const crawlId = project.latestCrawlId;
  const pages = await prisma.page.findMany({
    where: crawlId ? { projectId, crawlId } : { projectId },
    select: { url: true, finalUrl: true, title: true, pageType: true, status: true },
    take: 500,
  });

  const crawled = pages.filter((p) => p.status === "analyzed");
  const knownUrls = [...new Set(crawled.map((p) => p.finalUrl ?? p.url))];
  const seen = new Set<string>();
  const knownPages = crawled.flatMap((p) => {
    const url = p.finalUrl ?? p.url;
    if (seen.has(url)) return [];
    seen.add(url);
    return [{ url, title: p.title, pageType: p.pageType }];
  });

  const hasBusiness = Boolean(
    project.businessName ||
      project.businessType ||
      project.industry ||
      project.businessDescription,
  );

  return {
    projectId: project.id,
    rootUrl: project.rootUrl,
    name: project.name,
    analysisMode: project.analysisMode,
    business: hasBusiness
      ? {
          name: project.businessName,
          type: project.businessType,
          industry: project.industry,
          description: project.businessDescription,
          targetAudience: project.targetAudience,
          targetLocation: project.targetLocation,
          servicesProducts: project.servicesProducts,
          primaryGoal: project.primaryGoal,
          targetKeywords: project.targetKeywords,
        }
      : null,
    pageCount: pages.length,
    knownUrls,
    knownPages,
  };
}

/**
 * Renders knowledge for a prompt (Phase 1.8).
 *
 * Policies are rendered first and framed as overriding instructions, because a
 * policy exists precisely to stop the model repeating something an item's own
 * wording might suggest.
 */
export function buildKnowledgeContext(bundle: KnowledgeBundle): string {
  const parts: string[] = [];

  if (bundle.policies.length) {
    parts.push("## Binding policies — these override everything below");
    for (const policy of bundle.policies) {
      parts.push(
        [
          `### ${policy.id}`,
          `Decision: ${policy.decision}`,
          `Directive: ${policy.directive}`,
          `Never say: ${policy.neverSay.map((s) => `"${s}"`).join(" ")}`,
          `Claim to contradict if raised: "${policy.losingClaim}"`,
        ].join("\n"),
      );
    }
  }

  if (bundle.items.length) {
    parts.push("## Knowledge");
    for (const item of bundle.items) {
      const cite = item.sourceQuote
        ? `Source: ${item.sourceName}${item.sourceLocation ? `, ${item.sourceLocation}` : ""} — "${item.sourceQuote}"`
        : `Source: ${item.sourceName} (not directly quotable — do not present as a quotation)`;
      parts.push(
        [
          `### ${item.id} [${item.knowledgeType}/${item.evidenceStrength}]`,
          item.principle,
          `Apply: ${item.recommendedAction}`,
          `Limits: ${item.limitations}`,
          cite,
        ].join("\n"),
      );
    }
  }

  if (bundle.contradictions.length) {
    parts.push(
      "## Myths — never state these as advice. Contradict them if the user raises them.",
    );
    for (const myth of bundle.contradictions) {
      parts.push(`- ${myth.title}: ${myth.principle}`);
    }
  }

  return parts.join("\n\n");
}
