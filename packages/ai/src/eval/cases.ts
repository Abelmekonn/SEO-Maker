/**
 * The evaluation benchmark's fixed cases (Phase 4.3).
 *
 * Every meaningful change to a model, a prompt or the knowledge corpus is run
 * against these same cases, so results are comparable across runs. They cover
 * what the plan lists: missing and good meta, service, product and article
 * pages, schema, thin content, an ambiguous page, and images with and without
 * evidence, plus the site and competitor features.
 *
 * Fixtures are invented but realistic, and small. Each case states what a good
 * answer must and must not do; the scorers check those statements.
 */

import { compareWithCompetitor } from "@seo-maker/core/competitors";
import type { FixPlanInput } from "@seo-maker/core/page";
import { buildSiteIntelligence, deriveSiteOpportunities } from "@seo-maker/core/site";
import type { PageContext, SiteContext } from "../context";
import type { BusinessBlock, PageFeature } from "../features/page";

export type Expectations = {
  /** At least one suggestion must contain one of these words (specificity). */
  specificTerms?: string[];
  /** Must not appear anywhere in the output. Policy phrases are checked for every case. */
  forbidden?: RegExp[];
  /** The model must not be sure: confidence below high, or asks for review. */
  notConfident?: boolean;
  needsHumanReview?: boolean;
  /** schema: the JSON-LD @type must match. */
  entityType?: RegExp;
  /** `current` must equal the page's actual value. */
  current?: string | null;
  /** The diagnosis must (true) or must not (false) report the element as missing. */
  diagnosisMissing?: boolean;
  /** image-alt: bounds on suggestions kept after grounding. */
  minImages?: number;
  maxImages?: number;
  /** content: at least this many missing topics. */
  minMissingTopics?: number;
  /** routing: the deterministic plan must route the check this way, without a model call. */
  strategy?: { checkId: string; is: "deterministic" | "ai-generate" | "blocked" };
  /** competitor: "yes" is not allowed (Quick mode). */
  noYesWithoutBusiness?: boolean;
};

type Base = { id: string; description: string; covers: string[]; expect: Expectations };

export type PageCase = Base & {
  kind: "page";
  feature: PageFeature;
  context: PageContext;
  site?: SiteContext;
  business: BusinessBlock;
};

export type SiteCase = Base & { kind: "site"; business: BusinessBlock; build: () => ReturnType<typeof siteFixture> };
export type CompetitorCase = Base & { kind: "competitor"; business: BusinessBlock; build: () => ReturnType<typeof competitorFixture> };
export type RoutingCase = Base & { kind: "routing"; plan: FixPlanInput };

export type BenchmarkCase = PageCase | SiteCase | CompetitorCase | RoutingCase;

export function pageContext(overrides: Partial<PageContext> = {}): PageContext {
  return {
    pageId: "bench",
    url: "https://brightbooks.co.uk/services/bookkeeping",
    finalUrl: null,
    statusCode: 200,
    pageType: "service",
    pageTypeConfidence: 0.85,
    searchIntent: "commercial",
    searchIntentConfidence: 0.65,
    title: "Bookkeeping Services for Small Businesses | BrightBooks",
    metaDescription: null,
    h1: "Bookkeeping for small businesses",
    h1Count: 1,
    headings: [
      { level: 2, text: "Monthly bookkeeping" },
      { level: 2, text: "Payroll add-on" },
      { level: 2, text: "Pricing from £149 a month" },
    ],
    canonicalUrl: null,
    indexable: true,
    robotsMeta: null,
    language: "en-GB",
    wordCount: 640,
    contentExcerpt:
      "BrightBooks provides monthly bookkeeping for small businesses in Leeds. Our qualified bookkeepers reconcile your " +
      "bank feeds, chase unpaid invoices and prepare your VAT returns. Plans start at £149 a month and include a " +
      "dedicated bookkeeper who knows your business. We work with Xero and QuickBooks, and can add payroll for up to " +
      "25 employees. Switching from another bookkeeper takes about two weeks, and we handle the handover for you.",
    imageCount: 0,
    missingAlt: 0,
    imagesWithContext: [],
    imagesMissingAlt: [],
    internalLinkCount: 4,
    outgoingLinks: [],
    schemaTypes: [],
    issues: [],
    evidenceGaps: [],
    ...overrides,
  };
}

const DEEP_BUSINESS: BusinessBlock = {
  siteName: "BrightBooks",
  name: "BrightBooks",
  type: "accounting firm",
  industry: "accounting",
  targetAudience: "small business owners",
  targetLocation: "Leeds, United Kingdom",
  servicesProducts: ["Bookkeeping", "Payroll", "VAT returns"],
  primaryGoal: "consultation bookings",
};

function siteFixture() {
  const page = (path: string, extra: Record<string, unknown> = {}) => ({
    id: path,
    url: `https://brightbooks.co.uk${path}`,
    finalUrl: null,
    status: "analyzed",
    statusCode: 200,
    pageType: null,
    searchIntent: null,
    title: null,
    metaDesc: null,
    h1: null,
    wordCount: 600,
    internalLinks: 5,
    canonicalUrl: null,
    indexable: true,
    inSitemap: true,
    robotsDisallowed: false,
    depth: 1,
    discoveredVia: "link",
    contentHash: null,
    evidence: null,
    issues: [] as Array<{ checkId: string; status: string; severity: string }>,
    ...extra,
  });
  const missing = (checkId: string, severity = "high") => [{ checkId, status: "fail", severity }];
  const intel = buildSiteIntelligence({
    rootUrl: "https://brightbooks.co.uk",
    pages: [
      page("/", { depth: 0, pageType: "homepage", title: "BrightBooks | Bookkeeping in Leeds", h1: "Bookkeeping for Leeds businesses" }),
      page("/services/bookkeeping", { pageType: "service", title: "Bookkeeping | BrightBooks", h1: "Bookkeeping", issues: missing("meta") }),
      page("/services/payroll", { pageType: "service", title: "Payroll | BrightBooks", h1: "Payroll", issues: missing("meta") }),
      page("/services/vat", { pageType: "service", title: "VAT returns | BrightBooks", h1: "VAT returns", issues: missing("meta") }),
      page("/blog/vat-deadlines", { pageType: "article", title: "VAT deadlines explained | BrightBooks", h1: "VAT deadlines explained", wordCount: 180, issues: missing("words", "medium") }),
      page("/old-offer", { indexable: false, inSitemap: true, title: "Old offer", issues: missing("indexability", "critical") }),
    ],
    crawl: { discovered: 6, analyzed: 6, maxPages: 10, robotsAudit: null, sitemapAudit: null },
    business: { offerings: ["Bookkeeping", "Payroll", "VAT returns", "Tax planning"], targetKeywords: [] },
  });
  return { intel, candidates: deriveSiteOpportunities(intel) };
}

function competitorFixture() {
  const { intel } = siteFixture();
  const comparison = compareWithCompetitor({
    domain: "leedsledger.co.uk",
    self: intel,
    competitorPages: [
      { url: "https://leedsledger.co.uk/services/bookkeeping", title: "Bookkeeping", h1: "Bookkeeping", wordCount: 1400, internalLinks: 30, pageType: "service", schemaTypes: ["Service", "FAQPage"], headings: [] },
      { url: "https://leedsledger.co.uk/services/tax-planning", title: "Tax planning", h1: "Tax planning for owner-managed businesses", wordCount: 1200, internalLinks: 28, pageType: "service", schemaTypes: ["Service"], headings: [] },
      { url: "https://leedsledger.co.uk/pricing", title: "Pricing", h1: "Fixed monthly fees", wordCount: 500, internalLinks: 25, pageType: "pricing", schemaTypes: ["FAQPage"], headings: [] },
    ],
  });
  return { intel, comparison };
}

const imageCaption = {
  src: "https://brightbooks.co.uk/img/team-2026.jpg",
  filename: "team 2026",
  context: "Our accounting team at the Leeds office, photographed in March 2026",
  // The benchmark runs text-only: no image is ever sent.
  fetchable: false,
};

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "meta-missing-service",
    kind: "page",
    feature: "meta",
    description: "Service page with no meta description and plenty of text.",
    covers: ["missing meta", "service page"],
    context: pageContext(),
    business: null,
    expect: { specificTerms: ["bookkeeping", "bookkeeper"], current: null, diagnosisMissing: true },
  },
  {
    id: "meta-good",
    kind: "page",
    feature: "meta",
    description: "A page whose description is already good. Must not be reported as missing.",
    covers: ["good meta"],
    context: pageContext({
      metaDescription:
        "Monthly bookkeeping for Leeds small businesses from £149 a month: bank reconciliation, invoice chasing and VAT returns by a dedicated bookkeeper.",
    }),
    business: null,
    expect: {
      specificTerms: ["bookkeeping"],
      current:
        "Monthly bookkeeping for Leeds small businesses from £149 a month: bank reconciliation, invoice chasing and VAT returns by a dedicated bookkeeper.",
      diagnosisMissing: false,
    },
  },
  {
    id: "title-service-deep",
    kind: "page",
    feature: "title",
    description: "Service page in Deep mode: the business name and market may be used.",
    covers: ["service page", "deep mode"],
    context: pageContext(),
    business: DEEP_BUSINESS,
    expect: {
      specificTerms: ["bookkeeping"],
      current: "Bookkeeping Services for Small Businesses | BrightBooks",
      diagnosisMissing: false,
    },
  },
  {
    id: "schema-product",
    kind: "page",
    feature: "schema",
    description: "Product page with a price in the text. JSON-LD must be Product and invent no ratings.",
    covers: ["product page", "schema"],
    context: pageContext({
      url: "https://aerodesks.co.uk/products/aero-2",
      pageType: "product",
      pageTypeConfidence: 0.9,
      title: "Aero 2 Electric Standing Desk | AeroDesks",
      h1: "Aero 2 electric standing desk",
      headings: [{ level: 2, text: "Specifications" }, { level: 2, text: "Delivery" }],
      contentExcerpt:
        "The Aero 2 is an electric standing desk with a dual-motor frame that lifts from 62 cm to 127 cm. The oak " +
        "top measures 140 by 70 cm. Price £499 including VAT. Free delivery to UK mainland addresses within 5 working days.",
      wordCount: 380,
    }),
    business: null,
    expect: { entityType: /^product$/i, forbidden: [/aggregateRating|ratingValue|reviewCount/i] },
  },
  {
    id: "title-article-missing",
    kind: "page",
    feature: "title",
    description: "Article with no title tag. The title must come from the article's own subject.",
    covers: ["article", "missing title"],
    context: pageContext({
      url: "https://brightbooks.co.uk/blog/how-to-file-a-vat-return",
      pageType: "article",
      pageTypeConfidence: 0.85,
      searchIntent: "informational",
      searchIntentConfidence: 0.9,
      title: null,
      h1: "How to file a VAT return: a step-by-step guide",
      headings: [{ level: 2, text: "Check your VAT period" }, { level: 2, text: "Submit through Making Tax Digital software" }],
      contentExcerpt:
        "Filing a VAT return means reporting the VAT you charged and the VAT you paid for one accounting period. Most " +
        "UK businesses must now submit through software compatible with Making Tax Digital. This guide walks through " +
        "each step, from checking your period dates to paying what you owe.",
      wordCount: 1100,
    }),
    business: null,
    expect: { specificTerms: ["vat"], current: null, diagnosisMissing: true },
  },
  {
    id: "schema-article",
    kind: "page",
    feature: "schema",
    description: "Article page. JSON-LD should be an Article type with no invented author or dates.",
    covers: ["article", "schema"],
    context: pageContext({
      url: "https://brightbooks.co.uk/blog/how-to-file-a-vat-return",
      pageType: "article",
      pageTypeConfidence: 0.85,
      title: "How to file a VAT return | BrightBooks",
      h1: "How to file a VAT return: a step-by-step guide",
      contentExcerpt: "Filing a VAT return means reporting the VAT you charged and the VAT you paid for one accounting period.",
      wordCount: 1100,
    }),
    business: null,
    expect: { entityType: /article|blogposting|newsarticle/i, forbidden: [/"datePublished"\s*:\s*"20\d\d/] },
  },
  {
    id: "content-thin",
    kind: "page",
    feature: "content",
    description: "A thin page. Must recommend missing topics without naming a word count.",
    covers: ["thin content"],
    context: pageContext({
      url: "https://brightbooks.co.uk/services/payroll",
      title: "Payroll | BrightBooks",
      h1: "Payroll",
      headings: [],
      contentExcerpt: "We run payroll for small businesses. Contact us for a quote.",
      wordCount: 120,
      issues: [{ checkId: "words", status: "warning", severity: "medium", message: "Enough content", evidence: "120 words" }],
    }),
    business: null,
    expect: { minMissingTopics: 1 },
  },
  {
    id: "title-ambiguous",
    kind: "page",
    feature: "title",
    description: "A page with almost no signal. The honest answer is an uncertain one.",
    covers: ["ambiguous page"],
    context: pageContext({
      url: "https://example-studio.com/x",
      pageType: "other",
      pageTypeConfidence: 0.2,
      searchIntent: null,
      searchIntentConfidence: null,
      title: "Home",
      h1: null,
      headings: [],
      contentExcerpt: "Welcome. We do things differently. Get in touch to find out more.",
      wordCount: 12,
      evidenceGaps: ["Page type is unknown, so type-specific advice cannot be given."],
    }),
    business: null,
    expect: { notConfident: true, current: "Home" },
  },
  {
    id: "image-alt-caption",
    kind: "page",
    feature: "image-alt",
    description: "An image with a caption. A suggestion is allowed, and still needs a human.",
    covers: ["image evidence"],
    context: pageContext({ imageCount: 1, missingAlt: 1, imagesMissingAlt: [imageCaption] }),
    business: null,
    expect: { minImages: 1, needsHumanReview: true, forbidden: [/"alt"\s*:\s*"(image|picture|photo) of/i] },
  },
  {
    id: "image-no-evidence",
    kind: "routing",
    description: "Images with no caption, text or filename. Must be blocked before any model call.",
    covers: ["image no evidence"],
    plan: {
      url: "https://brightbooks.co.uk/about",
      contentLength: 2000,
      describableMissingAlt: 0,
      missingAlt: 3,
      knownUrlCount: 10,
      failing: [{ checkId: "images", status: "warning", severity: "low" }],
    },
    expect: { strategy: { checkId: "images", is: "blocked" } },
  },
  {
    id: "site-opportunities-deep",
    kind: "site",
    description: "Site opportunities from a small Deep-mode site. Ids and numbers must come from the facts.",
    covers: ["site opportunities", "deep mode"],
    business: DEEP_BUSINESS,
    build: siteFixture,
    expect: { specificTerms: ["meta", "description", "tax planning", "noindex", "index"] },
  },
  {
    id: "competitor-quick",
    kind: "competitor",
    description: "Competitor interpretation without business context. No gap may be called worth pursuing.",
    covers: ["competitor insight", "quick mode"],
    business: null,
    build: competitorFixture,
    expect: { noYesWithoutBusiness: true },
  },
];

export function knownSiteContext(): SiteContext {
  return {
    projectId: "bench",
    rootUrl: "https://brightbooks.co.uk",
    name: "BrightBooks",
    analysisMode: "quick",
    business: null,
    pageCount: 4,
    knownUrls: [],
    knownPages: [],
  };
}
