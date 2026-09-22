/**
 * Deterministic page classification.
 *
 * Phase 2.4 wants page types so recommendations can differ between a homepage
 * and a service page, and says to use deterministic heuristics first with AI
 * only for ambiguous cases. This is the deterministic half. It also fills
 * `Page.pageType`, which existed in the schema but was never written.
 *
 * Everything here is URL- and markup-derived; nothing is inferred. When the
 * signals are weak the answer is `other`, not a guess.
 */

export type PageType =
  | "homepage"
  | "service"
  | "product"
  | "pricing"
  | "category"
  | "article"
  | "documentation"
  | "about"
  | "contact"
  | "legal"
  | "landing"
  | "other";

export type ClassifyInput = {
  url: string;
  title?: string | null;
  h1?: string | null;
  /** Schema.org `@type` values found on the page. */
  schemaTypes?: string[];
  wordCount?: number | null;
};

export type Classification = {
  type: PageType;
  /** 0-1. Low confidence means "treat this as unclassified". */
  confidence: number;
  /** Human-readable signals behind the decision. */
  evidence: string[];
};

/** Schema.org types that settle the question on their own. */
const SCHEMA_TYPE: Record<string, PageType> = {
  product: "product",
  offer: "product",
  service: "service",
  article: "article",
  newsarticle: "article",
  blogposting: "article",
  techarticle: "documentation",
  aboutpage: "about",
  contactpage: "contact",
  collectionpage: "category",
  faqpage: "documentation",
};

/** First-path-segment patterns. Ordered: the first match wins. */
const PATH_PATTERNS: Array<{ type: PageType; pattern: RegExp }> = [
  { type: "legal", pattern: /^\/(legal|terms|tos|privacy|policies|policy|gdpr|dpa|cookies?|imprint|impressum|licen[cs]es?|compliance|disclaimer)(\/|$)/i },
  { type: "pricing", pattern: /^\/(pricing|plans?|prices?|cost|quote)(\/|$)/i },
  { type: "contact", pattern: /^\/(contact|support|help-?desk|get-in-touch)(\/|$)/i },
  { type: "about", pattern: /^\/(about|about-us|company|team|careers?|jobs|mission|story)(\/|$)/i },
  { type: "documentation", pattern: /^\/(docs?|documentation|api|developers?|guides?|reference|manual|faq|knowledge-?base|kb)(\/|$)/i },
  { type: "article", pattern: /^\/(blog|news|articles?|posts?|insights|stories|resources?|press|changelog|updates)(\/|$)/i },
  { type: "product", pattern: /^\/(products?|shop|store|items?|catalog(ue)?)(\/|$)/i },
  { type: "service", pattern: /^\/(services?|solutions?|capabilities|offerings?|what-we-do)(\/|$)/i },
  { type: "category", pattern: /^\/(categor(y|ies)|collections?|tags?|topics?|browse)(\/|$)/i },
  { type: "landing", pattern: /^\/(lp|landing|campaigns?|go|get|try|start|signup|sign-up|demo|free-trial)(\/|$)/i },
];

/** Page types that are normally excluded from search on purpose. */
const USUALLY_NOINDEX: ReadonlySet<PageType> = new Set(["legal", "landing"]);

export function classifyPage(input: ClassifyInput): Classification {
  const evidence: string[] = [];

  let pathname: string;
  try {
    pathname = new URL(input.url).pathname || "/";
  } catch {
    return { type: "other", confidence: 0, evidence: ["URL could not be parsed"] };
  }

  if (pathname === "/" || pathname === "") {
    return { type: "homepage", confidence: 1, evidence: ["Root path"] };
  }

  const schemaTypes = (input.schemaTypes ?? []).map((value) => value.toLowerCase());
  for (const schemaType of schemaTypes) {
    const mapped = SCHEMA_TYPE[schemaType];
    if (mapped) {
      evidence.push(`schema.org ${schemaType}`);
      return { type: mapped, confidence: 0.9, evidence };
    }
  }

  for (const { type, pattern } of PATH_PATTERNS) {
    if (pattern.test(pathname)) {
      evidence.push(`URL path matches ${type}`);
      // A deeper path under a section is a leaf of that section, which is a
      // stronger signal than the section index itself.
      const depth = pathname.split("/").filter(Boolean).length;
      return { type, confidence: depth > 1 ? 0.85 : 0.75, evidence };
    }
  }

  const heading = `${input.title ?? ""} ${input.h1 ?? ""}`.toLowerCase();
  if (/\bpricing\b|\bplans\b/.test(heading)) {
    evidence.push("Title or H1 mentions pricing");
    return { type: "pricing", confidence: 0.6, evidence };
  }
  if (/\bcontact\b/.test(heading)) {
    evidence.push("Title or H1 mentions contact");
    return { type: "contact", confidence: 0.6, evidence };
  }

  return { type: "other", confidence: 0.2, evidence: ["No decisive signal"] };
}

/**
 * Whether `noindex` on this page type is the expected configuration.
 *
 * Used to stop the product from reporting a site's deliberately excluded legal
 * and campaign pages as critical failures. This is only half the rule — see
 * `indexabilityVerdict`, which also weighs sitemap membership.
 */
export function noindexIsExpected(type: PageType | null | undefined): boolean {
  return type != null && USUALLY_NOINDEX.has(type);
}
