/**
 * Grounded page features (Phase 2.3).
 *
 * One spec per feature: the evidence it may use, the knowledge it retrieves,
 * its prompt, and the grounding checks its output must pass before storage.
 * The worker runs a spec through `runAiFeature`; nothing here calls a model.
 *
 * Each spec sends only the evidence its feature needs. That keeps a call to
 * roughly 2-3k tokens instead of the whole page context, which matters on a
 * provider tier measured in tokens per minute, and it keeps the cache key
 * honest: a title only regenerates when something a title depends on changes.
 */

import type { z } from "zod";
import type { AiFeature } from "../config";
import type { PageContext, SiteContext } from "../context";
import type { KnowledgeQuery } from "../knowledge";
import {
  contentSchema,
  headingSchema,
  imageAltSchema,
  internalLinkSchema,
  keepKnownUrls,
  metaSchema,
  schemaMarkupSchema,
  titleSchema,
} from "../schemas";

export type PageFeature = "title" | "meta" | "heading" | "content" | "schema" | "internal-link" | "image-alt";

export type Refine<T> = (data: T) => { ok: true; data: T } | { ok: false; reason: string };

export type PageFeatureSpec<T> = {
  feature: AiFeature;
  schema: z.ZodType<T>;
  knowledge: KnowledgeQuery;
  /** Hashed into the cache key, and the only page facts the prompt contains. */
  evidence: Record<string, unknown>;
  buildPrompt: (knowledgeBlock: string) => { system: string; user: string };
  refine?: Refine<T>;
  maxTokens: number;
  temperature: number;
};

/** Business context as the prompt sees it. Null in Quick mode. */
export type BusinessBlock = Record<string, unknown> | null;

export const PAGE_SYSTEM_PROMPT = [
  "You are the writing layer of an SEO auditing tool. You write replacement copy and fixes for one page.",
  "",
  "Rules you must follow without exception:",
  "1. Use only the EVIDENCE and KNOWLEDGE given to you. Never invent a product, feature, price,",
  "   statistic, customer, URL or claim that the evidence does not contain.",
  "2. The BINDING POLICIES section overrides everything, including your own habits. In particular,",
  "   do not justify a title or description by a character count: no search engine publishes one.",
  "3. Never state a myth as advice.",
  "4. When the evidence is not enough for a specific answer, say so in the output (low confidence,",
  "   needsHumanReview: true) rather than filling the gap.",
  "5. Write in the page's language. Match the page's own terminology.",
  "6. Do not promise rankings, traffic or rich results.",
  "7. In `groundedIn`, list the evidence field names and knowledge item ids you actually used.",
  "",
  "Respond with a single JSON object and no other text.",
].join("\n");

const EXCERPT = { short: 1500, medium: 2500, long: 4000 } as const;

function excerpt(context: PageContext, chars: number): string | null {
  return context.contentExcerpt ? context.contentExcerpt.slice(0, chars) : null;
}

function headings(context: PageContext, limit: number) {
  return context.headings.slice(0, limit).map((heading) => `H${heading.level}: ${heading.text}`);
}

function knowledge(checks: string[]): KnowledgeQuery {
  // Page features are classic-search work. Restricting the domain keeps GEO
  // items (AI-answer visibility) out of a title or meta prompt, where they
  // produced off-topic advice in testing.
  return { checks, applicability: ["page_audit", "reporting_language", "myth_guard"], domain: "seo", limit: 8 };
}

function userPrompt(
  evidence: Record<string, unknown>,
  gaps: string[],
  business: BusinessBlock,
  knowledgeBlock: string,
  task: string[],
): string {
  return [
    "# EVIDENCE (from the crawl — the only facts you may use about this page)",
    JSON.stringify(evidence, null, 2),
    "",
    "# EVIDENCE GAPS (things the crawl could NOT establish)",
    gaps.length ? gaps.map((gap) => `- ${gap}`).join("\n") : "- None.",
    "",
    "# SITE AND BUSINESS CONTEXT",
    business
      ? JSON.stringify(business, null, 2)
      : "Not provided (Quick mode). Do not guess the business, its audience or its location; write from the page alone.",
    "",
    knowledgeBlock || "# KNOWLEDGE\nNone was retrieved.",
    "",
    "# TASK",
    ...task,
  ].join("\n");
}

function common(context: PageContext) {
  return {
    url: context.finalUrl ?? context.url,
    language: context.language,
    pageType: context.pageType,
    pageTypeConfidence: context.pageTypeConfidence,
    searchIntent: context.searchIntent,
    searchIntentConfidence: context.searchIntentConfidence,
  };
}

// ------------------------------------------------------------------ specs

function titleSpec(context: PageContext, business: BusinessBlock): PageFeatureSpec<z.infer<typeof titleSchema>> {
  const evidence = {
    ...common(context),
    currentTitle: context.title,
    h1: context.h1,
    headings: headings(context, 12),
    contentExcerpt: excerpt(context, EXCERPT.short),
  };
  return {
    feature: "title",
    schema: titleSchema,
    knowledge: knowledge(["title"]),
    evidence,
    maxTokens: 1500,
    temperature: 0.3,
    buildPrompt: (block) => ({
      system: PAGE_SYSTEM_PROMPT,
      user: userPrompt(evidence, context.evidenceGaps, business, block, [
        "Write up to three replacement <title> texts for this page, best first.",
        "Each must be unique to this page, describe what the page actually covers, and fit its search intent.",
        "Use the business name only if it appears in the evidence or the business context.",
        'In `diagnosis`, state what is wrong with the current title, or "No title tag" when there is none.',
        "Return JSON: {",
        '  "current": string|null, "diagnosis": string,',
        '  "suggestions": [{ "value": string, "reasoning": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ]),
    }),
    refine: (data) => ({ ok: true, data: { ...data, current: context.title } }),
  };
}

function metaSpec(context: PageContext, business: BusinessBlock): PageFeatureSpec<z.infer<typeof metaSchema>> {
  const evidence = {
    ...common(context),
    title: context.title,
    h1: context.h1,
    currentMetaDescription: context.metaDescription,
    headings: headings(context, 12),
    contentExcerpt: excerpt(context, EXCERPT.medium),
  };
  return {
    feature: "meta",
    schema: metaSchema,
    knowledge: knowledge(["meta"]),
    evidence,
    maxTokens: 1500,
    temperature: 0.3,
    buildPrompt: (block) => ({
      system: PAGE_SYSTEM_PROMPT,
      user: userPrompt(evidence, context.evidenceGaps, business, block, [
        "Write up to three meta descriptions for this page, best first.",
        "Each must be unique to this page and name its most relevant points, taken from the content excerpt.",
        'In `diagnosis`, state what is wrong with the current description, or "No meta description".',
        "Return JSON: {",
        '  "current": string|null, "diagnosis": string,',
        '  "suggestions": [{ "value": string, "reasoning": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ]),
    }),
    refine: (data) => ({ ok: true, data: { ...data, current: context.metaDescription } }),
  };
}

function headingSpec(context: PageContext, business: BusinessBlock): PageFeatureSpec<z.infer<typeof headingSchema>> {
  const evidence = {
    ...common(context),
    title: context.title,
    currentH1: context.h1,
    h1Count: context.h1Count,
    headings: headings(context, 15),
    contentExcerpt: excerpt(context, EXCERPT.medium),
  };
  return {
    feature: "heading",
    schema: headingSchema,
    knowledge: knowledge(["h1"]),
    evidence,
    maxTokens: 1500,
    temperature: 0.3,
    buildPrompt: (block) => ({
      system: PAGE_SYSTEM_PROMPT,
      user: userPrompt(evidence, context.evidenceGaps, business, block, [
        "Write up to three top-level headings (H1) for this page, best first.",
        "Each must state plainly what the page is about, using the page's own content.",
        "Do not claim a heading count rule: search engines do not require exactly one H1.",
        'In `diagnosis`, state what is wrong with the current H1, or "No H1 on the page".',
        "Return JSON: {",
        '  "current": string|null, "diagnosis": string,',
        '  "suggestions": [{ "value": string, "reasoning": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ]),
    }),
    refine: (data) => ({ ok: true, data: { ...data, current: context.h1 } }),
  };
}

function contentSpec(context: PageContext, business: BusinessBlock): PageFeatureSpec<z.infer<typeof contentSchema>> {
  const evidence = {
    ...common(context),
    title: context.title,
    h1: context.h1,
    wordCount: context.wordCount,
    headings: headings(context, 40),
    contentExcerpt: excerpt(context, EXCERPT.long),
    failingChecks: context.issues.filter((issue) => issue.checkId === "words" || issue.checkId === "h2"),
  };
  return {
    feature: "content",
    schema: contentSchema,
    knowledge: knowledge(["words", "h2"]),
    evidence,
    maxTokens: 2500,
    temperature: 0.3,
    buildPrompt: (block) => ({
      system: PAGE_SYSTEM_PROMPT,
      user: userPrompt(evidence, context.evidenceGaps, business, block, [
        "Recommend how to improve this page's content without rewriting it.",
        "- missingTopics: questions or topics a visitor with this page's intent would expect and the page does not cover.",
        "- outline: a section outline (H2 headings with their purpose) only if the page lacks structure; otherwise [].",
        "- unclearSections: quote an exact excerpt from the content and say how to make it clearer; only real excerpts.",
        "Do not recommend a target word count. Length is not a ranking factor on its own.",
        "Return JSON: {",
        '  "missingTopics": [{ "topic": string, "why": string }],',
        '  "outline": [{ "heading": string, "purpose": string }],',
        '  "unclearSections": [{ "excerpt": string, "problem": string, "improvement": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ]),
    }),
    refine: (data) => {
      // A quoted excerpt that is not in the page is an invention. Drop it.
      const text = (context.contentExcerpt ?? "").toLowerCase();
      const unclearSections = data.unclearSections.filter((section) =>
        text.includes(section.excerpt.toLowerCase().slice(0, 60)),
      );
      return { ok: true, data: { ...data, unclearSections } };
    },
  };
}

function schemaSpec(
  context: PageContext,
  business: BusinessBlock,
): PageFeatureSpec<z.infer<typeof schemaMarkupSchema>> {
  const evidence = {
    ...common(context),
    title: context.title,
    metaDescription: context.metaDescription,
    h1: context.h1,
    existingSchemaTypes: context.schemaTypes,
    headings: headings(context, 10),
    contentExcerpt: excerpt(context, EXCERPT.short),
  };
  return {
    feature: "schema",
    schema: schemaMarkupSchema,
    knowledge: knowledge(["schema"]),
    evidence,
    maxTokens: 2500,
    temperature: 0.2,
    buildPrompt: (block) => ({
      system: PAGE_SYSTEM_PROMPT,
      user: userPrompt(evidence, context.evidenceGaps, business, block, [
        `Write JSON-LD for this page. The page is classified as "${context.pageType}"; choose the schema.org @type that fits it.`,
        "Include only properties whose values appear in the evidence or the business context.",
        "List required or recommended properties you could not fill in `missingRequiredProperties` instead of inventing values.",
        'Name rich-result features the markup makes the page eligible for in `eligibleFeatures`; never say it "will" get them.',
        "Return JSON: {",
        '  "entityType": string, "entityReasoning": string,',
        '  "jsonLd": object (with "@context": "https://schema.org" and "@type"),',
        '  "eligibleFeatures": string[], "missingRequiredProperties": string[],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ]),
    }),
    refine: (data) => {
      const json = data.jsonLd as Record<string, unknown>;
      const contextValue = String(json["@context"] ?? "");
      if (!/schema\.org/i.test(contextValue)) {
        return { ok: false, reason: 'JSON-LD has no schema.org "@context".' };
      }
      const types = ([] as unknown[]).concat(json["@type"] ?? []).map(String);
      if (types.length === 0) {
        return { ok: false, reason: 'JSON-LD has no "@type".' };
      }
      if (!types.some((type) => type.toLowerCase() === data.entityType.toLowerCase())) {
        return { ok: false, reason: `JSON-LD @type ${types.join(", ")} does not match entityType ${data.entityType}.` };
      }
      return { ok: true, data };
    },
  };
}

function internalLinkSpec(
  context: PageContext,
  site: SiteContext,
  business: BusinessBlock,
): PageFeatureSpec<z.infer<typeof internalLinkSchema>> {
  const self = context.finalUrl ?? context.url;
  const alreadyLinked = new Set(context.outgoingLinks.map((link) => link.href.replace(/\/+$/, "")));
  const candidates = site.knownPages
    .filter((page) => page.url.replace(/\/+$/, "") !== self.replace(/\/+$/, ""))
    .filter((page) => !alreadyLinked.has(page.url.replace(/\/+$/, "")))
    .slice(0, 60);

  const evidence = {
    ...common(context),
    title: context.title,
    h1: context.h1,
    contentExcerpt: excerpt(context, EXCERPT.short),
    existingInternalLinks: context.outgoingLinks.slice(0, 25),
    candidateTargets: candidates,
  };
  return {
    feature: "internal-link",
    schema: internalLinkSchema,
    knowledge: knowledge(["links"]),
    evidence,
    maxTokens: 2000,
    temperature: 0.3,
    buildPrompt: (block) => ({
      system: PAGE_SYSTEM_PROMPT,
      user: userPrompt(evidence, context.evidenceGaps, business, block, [
        "Suggest internal links from this page to related pages on the same site.",
        "`targetUrl` MUST be copied exactly from `candidateTargets`. Any other URL is rejected.",
        "Pick targets whose title is genuinely related to this page's content. Fewer good links beat many weak ones.",
        "`anchorText` should describe the target page, not say \"click here\".",
        "`placement` says where in this page's content the link fits, referring to its real text.",
        "Return JSON: {",
        '  "suggestions": [{ "targetUrl": string, "anchorText": string, "placement": string, "reasoning": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ]),
    }),
    refine: (data) => {
      const { kept, dropped } = keepKnownUrls(data.suggestions, candidates.map((page) => page.url));
      if (kept.length === 0) {
        return {
          ok: false,
          reason: `Every suggested target was outside the crawled pages (${dropped.map((row) => row.targetUrl).join(", ").slice(0, 300)}).`,
        };
      }
      return { ok: true, data: { ...data, suggestions: kept } };
    },
  };
}

function imageAltSpec(context: PageContext, business: BusinessBlock): PageFeatureSpec<z.infer<typeof imageAltSchema>> {
  const images = context.imagesMissingAlt;
  const evidence = {
    ...common(context),
    title: context.title,
    h1: context.h1,
    imagesMissingAlt: images,
  };
  return {
    feature: "image-alt",
    schema: imageAltSchema,
    knowledge: knowledge(["images"]),
    evidence,
    maxTokens: 2000,
    temperature: 0.2,
    buildPrompt: (block) => ({
      system: PAGE_SYSTEM_PROMPT,
      user: userPrompt(evidence, context.evidenceGaps, business, block, [
        "Suggest alt text for the images in `imagesMissingAlt`. You CANNOT see these images.",
        "Write alt text only from an image's `context` (caption or nearby text) or a meaningful `filename`,",
        "and set `basis` to what you used. If neither tells you what the image shows, put it in `skipped`",
        "with the reason. Do not guess what an image looks like.",
        "Alt text describes the image's role on the page in a short phrase. Do not start with \"image of\".",
        "Return JSON: {",
        '  "images": [{ "src": string, "alt": string, "basis": "caption"|"surrounding-text"|"filename" }],',
        '  "skipped": [{ "src": string, "reason": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": true',
        "}",
      ]),
    }),
    refine: (data) => {
      const offered = new Map(images.map((image) => [image.src, image]));
      const kept = data.images.filter((row) => {
        const source = offered.get(row.src);
        if (!source) return false;
        if (row.basis === "filename") return Boolean(source.filename);
        return source.context.trim().length > 0;
      });
      // Nobody can verify alt text without looking at the image.
      return { ok: true, data: { ...data, images: kept, needsHumanReview: true } };
    },
  };
}

/** The spec for one feature on one page. */
export function pageFeatureSpec(
  feature: PageFeature,
  context: PageContext,
  site: SiteContext,
  business: BusinessBlock,
): PageFeatureSpec<unknown> {
  switch (feature) {
    case "title":
      return titleSpec(context, business) as PageFeatureSpec<unknown>;
    case "meta":
      return metaSpec(context, business) as PageFeatureSpec<unknown>;
    case "heading":
      return headingSpec(context, business) as PageFeatureSpec<unknown>;
    case "content":
      return contentSpec(context, business) as PageFeatureSpec<unknown>;
    case "schema":
      return schemaSpec(context, business) as PageFeatureSpec<unknown>;
    case "internal-link":
      return internalLinkSpec(context, site, business) as PageFeatureSpec<unknown>;
    case "image-alt":
      return imageAltSpec(context, business) as PageFeatureSpec<unknown>;
  }
}
