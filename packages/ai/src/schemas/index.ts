/**
 * Structured output contracts (Phase 1.3).
 *
 * Every model result passes one of these before it is stored. Two conventions
 * run through all of them:
 *
 *  - `groundedIn` is required. The model must name the evidence it used, so a
 *    recommendation that cites nothing is a validation failure rather than a
 *    plausible-sounding guess that reaches the user.
 *
 *  - `confidence` and `needsHumanReview` are required. Phase 0.3's image rule
 *    generalises: when the evidence does not support a specific answer, the
 *    correct output is an honest low-confidence one, not a fabricated one.
 *
 * Deliberately absent: any character-count field on titles or meta descriptions.
 * `policy-title-meta-length` in the knowledge corpus records why — Google
 * publishes no limit, and a schema field would re-introduce the rule the corpus
 * exists to refute.
 */

import { z } from "zod";

/** Where a claim came from. Free-text ids the caller put into the prompt. */
const groundedIn = z
  .array(z.string().min(1).max(200))
  .min(1, "Name at least one piece of evidence or knowledge item used.")
  .max(12);

const confidence = z.enum(["high", "medium", "low"]);

const base = {
  groundedIn,
  confidence,
  needsHumanReview: z.boolean(),
};

/** A single suggested replacement, with the reason it is better. */
const suggestion = z.object({
  value: z.string().min(1).max(400),
  reasoning: z.string().min(1).max(600),
});

// ---------------------------------------------------------------- page

export const pageRecommendationSchema = z.object({
  ...base,
  summary: z.string().min(1).max(600),
  recommendations: z
    .array(
      z.object({
        checkId: z.string().min(1).max(60),
        issue: z.string().min(1).max(400),
        whyItMatters: z.string().min(1).max(600),
        action: z.string().min(1).max(800),
        severity: z.enum(["critical", "high", "medium", "low"]),
        /** False when the fix needs evidence the crawl does not have. */
        actionable: z.boolean(),
      }),
    )
    .min(1)
    .max(12),
});
export type PageRecommendation = z.infer<typeof pageRecommendationSchema>;

// ---------------------------------------------------------------- title

export const titleSchema = z.object({
  ...base,
  current: z.string().max(400).nullable(),
  /** Ordered best-first. */
  suggestions: z.array(suggestion).min(1).max(3),
  /** Stated only when the crawl evidence actually shows a problem. */
  diagnosis: z.string().min(1).max(600),
});
export type TitleSuggestion = z.infer<typeof titleSchema>;

// ---------------------------------------------------------------- meta

export const metaSchema = z.object({
  ...base,
  current: z.string().max(600).nullable(),
  suggestions: z.array(suggestion).min(1).max(3),
  diagnosis: z.string().min(1).max(600),
});
export type MetaSuggestion = z.infer<typeof metaSchema>;

// ---------------------------------------------------------------- content

export const contentSchema = z.object({
  ...base,
  /** Topics the page should cover and does not. Preferred over rewriting. */
  missingTopics: z
    .array(
      z.object({
        topic: z.string().min(1).max(200),
        why: z.string().min(1).max(600),
      }),
    )
    .max(10),
  /** Suggested section outline, when the page lacks structure. */
  outline: z
    .array(
      z.object({
        heading: z.string().min(1).max(200),
        purpose: z.string().min(1).max(400),
      }),
    )
    .max(15),
  unclearSections: z
    .array(
      z.object({
        excerpt: z.string().min(1).max(400),
        problem: z.string().min(1).max(400),
        improvement: z.string().min(1).max(600),
      }),
    )
    .max(8),
});
export type ContentSuggestion = z.infer<typeof contentSchema>;

// ---------------------------------------------------------------- schema.org

export const schemaMarkupSchema = z.object({
  ...base,
  /** The @type chosen, and why the page evidence supports it. */
  entityType: z.string().min(1).max(80),
  entityReasoning: z.string().min(1).max(600),
  /** JSON-LD as an object. Re-validated before it is shown to a user. */
  jsonLd: z.record(z.string(), z.unknown()),
  /** Named so the UI can say "eligible for", never "will get". */
  eligibleFeatures: z.array(z.string().min(1).max(80)).max(6),
  missingRequiredProperties: z.array(z.string().min(1).max(80)).max(20),
});
export type SchemaMarkupSuggestion = z.infer<typeof schemaMarkupSchema>;

// ---------------------------------------------------------------- internal links

export const internalLinkSchema = z.object({
  ...base,
  suggestions: z
    .array(
      z.object({
        /** Must be a URL the crawl actually found. Checked after validation. */
        targetUrl: z.string().min(1).max(2000),
        anchorText: z.string().min(1).max(200),
        placement: z.string().min(1).max(400),
        reasoning: z.string().min(1).max(600),
      }),
    )
    .min(1)
    .max(10),
});
export type InternalLinkSuggestion = z.infer<typeof internalLinkSchema>;

// ---------------------------------------------------------------- site

export const siteOpportunitySchema = z.object({
  ...base,
  opportunities: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        category: z.string().min(1).max(60),
        rationale: z.string().min(1).max(800),
        action: z.string().min(1).max(800),
        effort: z.enum(["low", "medium", "high"]),
        /** Pages the opportunity applies to. URLs from the crawl only. */
        affectedUrls: z.array(z.string().max(2000)).max(50),
      }),
    )
    .min(1)
    .max(15),
});
export type SiteOpportunity = z.infer<typeof siteOpportunitySchema>;

// ---------------------------------------------------------------- competitor

export const competitorInsightSchema = z.object({
  ...base,
  summary: z.string().min(1).max(1200),
  strengths: z.array(z.string().min(1).max(400)).max(10),
  gaps: z
    .array(
      z.object({
        topic: z.string().min(1).max(200),
        observation: z.string().min(1).max(600),
        action: z.string().min(1).max(600),
      }),
    )
    .max(12),
});
export type CompetitorInsight = z.infer<typeof competitorInsightSchema>;

// ---------------------------------------------------------------- registry

import type { AiFeature } from "../config";

export const FEATURE_SCHEMAS = {
  "page-recommendation": pageRecommendationSchema,
  title: titleSchema,
  meta: metaSchema,
  content: contentSchema,
  schema: schemaMarkupSchema,
  "internal-link": internalLinkSchema,
  "site-opportunity": siteOpportunitySchema,
  "competitor-insight": competitorInsightSchema,
} as const satisfies Record<AiFeature, z.ZodTypeAny>;

export function schemaFor(feature: AiFeature) {
  return FEATURE_SCHEMAS[feature];
}

/**
 * Rejects link targets the crawl never saw (Phase 2.3: "do not invent existing
 * target URLs"). Lives here so the guarantee travels with the contract.
 */
export function keepKnownUrls<T extends { targetUrl: string }>(
  suggestions: T[],
  knownUrls: Iterable<string>,
): { kept: T[]; dropped: T[] } {
  const known = new Set<string>();
  for (const url of knownUrls) {
    known.add(normalizeForCompare(url));
  }

  const kept: T[] = [];
  const dropped: T[] = [];
  for (const suggestion of suggestions) {
    if (known.has(normalizeForCompare(suggestion.targetUrl))) {
      kept.push(suggestion);
    } else {
      dropped.push(suggestion);
    }
  }
  return { kept, dropped };
}

function normalizeForCompare(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "").toLowerCase();
  return trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "");
}
