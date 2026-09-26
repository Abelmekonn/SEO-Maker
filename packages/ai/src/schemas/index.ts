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
  suggestions: z.array(suggestion).min(1).max(4),
  /** Stated only when the crawl evidence actually shows a problem. */
  diagnosis: z.string().min(1).max(600),
});
export type TitleSuggestion = z.infer<typeof titleSchema>;

// ---------------------------------------------------------------- meta

export const metaSchema = z.object({
  ...base,
  current: z.string().max(600).nullable(),
  suggestions: z.array(suggestion).min(1).max(4),
  diagnosis: z.string().min(1).max(600),
});
export type MetaSuggestion = z.infer<typeof metaSchema>;

// ---------------------------------------------------------------- heading

/** A top-level heading. Same shape as a title: current, suggestions, diagnosis. */
export const headingSchema = z.object({
  ...base,
  current: z.string().max(400).nullable(),
  suggestions: z.array(suggestion).min(1).max(4),
  diagnosis: z.string().min(1).max(600),
});
export type HeadingSuggestion = z.infer<typeof headingSchema>;

// ---------------------------------------------------------------- image alt

/**
 * Alt text for images without it.
 *
 * `basis` says what the text was written from: the image itself ("image",
 * only accepted when the image was actually sent to a model that can see
 * it), a caption, nearby text, or a filename. `needsHumanReview` is forced
 * true on the way in. Images nothing describes go in `skipped` with a reason
 * instead of getting invented text.
 */
/**
 * Models name the evidence field they used ("context", "nearby text") rather
 * than the enum value. Those unambiguous synonyms are mapped; anything else
 * still fails validation.
 */
const BASIS_SYNONYMS: Record<string, string> = {
  context: "surrounding-text",
  "nearby-text": "surrounding-text",
  "nearby text": "surrounding-text",
  "surrounding text": "surrounding-text",
  surrounding_text: "surrounding-text",
  "file-name": "filename",
  "file name": "filename",
  "the image": "image",
  visual: "image",
};

const altBasis = z.preprocess(
  (value) => (typeof value === "string" ? (BASIS_SYNONYMS[value.trim().toLowerCase()] ?? value.trim().toLowerCase()) : value),
  z.enum(["image", "caption", "surrounding-text", "filename"]),
);

export const imageAltSchema = z.object({
  ...base,
  images: z
    .array(
      z.object({
        src: z.string().min(1).max(500),
        alt: z.string().min(1).max(250),
        basis: altBasis,
      }),
    )
    .max(15),
  // An answer that skipped nothing may leave the list out.
  skipped: z
    .array(z.object({ src: z.string().min(1).max(500), reason: z.string().min(1).max(300) }))
    .max(15)
    .default([]),
});
export type ImageAltSuggestion = z.infer<typeof imageAltSchema>;

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

/**
 * Wording for site opportunities (Phase 3.3).
 *
 * The opportunities themselves, their scores, effort and affected pages come
 * from the deterministic engine. The model only writes words for an `id` it
 * was given: there is no field here in which it could invent a URL, change a
 * priority, or add an opportunity the evidence does not support.
 */
export const siteOpportunitySchema = z.object({
  ...base,
  /** What the site's evidence says overall, in a few sentences. */
  summary: z.string().min(1).max(900),
  opportunities: z
    .array(
      z.object({
        /** The candidate id from the prompt. Anything else is dropped. */
        id: z.string().min(1).max(80),
        title: z.string().min(1).max(160),
        rationale: z.string().min(1).max(800),
        /** One sentence restating the facts. Numbers must match them. */
        evidence: z.string().min(1).max(600),
        action: z.string().min(1).max(800),
        /** The single first concrete step. */
        nextStep: z.string().min(1).max(400),
      }),
    )
    .min(1)
    .max(15),
});
export type SiteOpportunity = z.infer<typeof siteOpportunitySchema>;

// ---------------------------------------------------------------- site strategy

/** Evidence ids from the site strategy prompt, e.g. "section:/blog", "links". */
const evidenceRefs = z.array(z.string().min(1).max(160)).min(1, "Cite at least one evidence id.").max(8);

/** A page path from the evidence, e.g. "/pricing". Checked against it after validation. */
const pagePathRef = z.string().min(1).max(300);

/**
 * Site AI: strategy for the whole site.
 *
 * Grounded in Site Intelligence (sections, page types, link structure,
 * coverage and the deterministic opportunities), never in page bodies. Every
 * recommendation cites the evidence ids it rests on, and every page it names
 * must be a page the crawl found; both are checked after validation.
 * `evidenceSufficient` lets the model say the crawl was too small to support
 * a strategy, which is the right answer for a one-page crawl.
 */
export const siteStrategySchema = z.object({
  ...base,
  summary: z.string().min(1).max(1200),
  evidenceSufficient: z.boolean(),
  contentOpportunities: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        rationale: z.string().min(1).max(700),
        action: z.string().min(1).max(700),
        evidenceRefs,
      }),
    )
    .max(8),
  topicStructure: z.object({
    assessment: z.string().min(1).max(900),
    clusters: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          pages: z.array(pagePathRef).max(15),
          note: z.string().min(1).max(500),
          evidenceRefs,
        }),
      )
      .max(8),
  }),
  internalLinkStrategy: z
    .array(
      z.object({
        recommendation: z.string().min(1).max(500),
        rationale: z.string().min(1).max(700),
        examplePages: z.array(pagePathRef).max(6),
        evidenceRefs,
      }),
    )
    .max(6),
  architectureRecommendations: z
    .array(
      z.object({
        recommendation: z.string().min(1).max(500),
        rationale: z.string().min(1).max(700),
        evidenceRefs,
      }),
    )
    .max(6),
  contentStrategy: z.object({
    focus: z.string().min(1).max(900),
    priorities: z
      .array(
        z.object({
          priority: z.string().min(1).max(300),
          rationale: z.string().min(1).max(700),
          evidenceRefs,
        }),
      )
      .max(6),
  }),
});
export type SiteStrategy = z.infer<typeof siteStrategySchema>;

// ---------------------------------------------------------------- competitor

/** A fact id from the deterministic comparison, e.g. "topic:3" or "sd:FAQPage". */
const factId = z.string().min(1).max(80);

const interpretation = z.object({
  factId,
  interpretation: z.string().min(1).max(500),
});

/**
 * Interpretation of a competitor comparison.
 *
 * Facts are observed by code and shown as facts. This contract holds only the
 * interpretation, and every entry must point at the fact it interprets, so
 * the two can never blur. `worthPursuing` exists because a competitor having a
 * page is not proof your site needs one.
 *
 * Four outputs: site comparison (summary, strengths, weaknesses), content and
 * topic gaps, structural differences, and opportunities. The last two
 * default to empty so results stored before they existed still read.
 */
export const competitorInsightSchema = z.object({
  ...base,
  summary: z.string().min(1).max(1200),
  strengths: z.array(interpretation).max(10),
  weaknesses: z.array(interpretation).max(10),
  gaps: z
    .array(
      z.object({
        factId,
        kind: z.enum(["topic", "keyword", "page-type", "depth", "structured-data"]),
        interpretation: z.string().min(1).max(500),
        recommendation: z.string().min(1).max(500),
        worthPursuing: z.enum(["yes", "maybe", "no"]),
        reason: z.string().min(1).max(400),
      }),
    )
    .max(12),
  /** How the two sites are built differently: page types, structured data, internal linking, depth. */
  structuralDifferences: z.array(interpretation).max(8).default([]),
  /** What the user could do about it, each tied to the facts it rests on. */
  opportunities: z
    .array(
      z.object({
        factIds: z.array(factId).min(1).max(6),
        title: z.string().min(1).max(200),
        action: z.string().min(1).max(600),
        worthPursuing: z.enum(["yes", "maybe", "no"]),
        reason: z.string().min(1).max(400),
      }),
    )
    .max(8)
    .default([]),
});
export type CompetitorInsight = z.infer<typeof competitorInsightSchema>;

// ---------------------------------------------------------------- registry

import type { AiFeature } from "../config";

export const FEATURE_SCHEMAS = {
  "page-recommendation": pageRecommendationSchema,
  title: titleSchema,
  meta: metaSchema,
  heading: headingSchema,
  "image-alt": imageAltSchema,
  content: contentSchema,
  schema: schemaMarkupSchema,
  "internal-link": internalLinkSchema,
  "site-opportunity": siteOpportunitySchema,
  "site-strategy": siteStrategySchema,
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
