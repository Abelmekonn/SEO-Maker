/**
 * Business evidence: what a competitor sells, from its own pages, and how
 * closely that matches what you say you sell.
 *
 * Deterministic and lexical, like the rest of the comparison: the words two
 * businesses use for their offering, and the schema.org and page types their
 * pages declare. Every match can be shown as the words that produced it.
 */

import { type SignalMeasurement, businessSimilarity } from "../scoring/confidence";
import { containment, termSet, titleTopic } from "../site/terms";

/** The families `businessSimilarity` compares. */
export type BusinessFamily = "saas" | "marketplace" | "ecommerce" | "blog" | "media" | "agency" | "local-service" | "other";

const FAMILY_PATTERNS: Array<[BusinessFamily, RegExp]> = [
  [
    "local-service",
    /\b(local|clinic|dentist|dental|doctor|medical practice|restaurant|cafe|café|bakery|salon|barber|spa|gym|plumb\w*|electrician|contractor|roofer|cleaning|repair|law firm|lawyer|attorney|solicitor|hotel|real estate agent|realtor|pharmacy|veterinar\w*|daycare|school|tutor\w*)\b/i,
  ],
  ["marketplace", /\b(marketplace|two-sided|peer[- ]to[- ]peer)\b/i],
  ["ecommerce", /\b(e-?commerce|online (shop|store)|webshop|retail\w*|shop|store|dtc|direct[- ]to[- ]consumer)\b/i],
  ["agency", /\b(agency|consult\w*|studio|firm|freelanc\w*|professional services?|services? company)\b/i],
  ["saas", /\b(saas|software|platform|app|apps|api|cloud|fintech|payments? (platform|provider|processor)|tech(nology)? company)\b/i],
  ["media", /\b(media|news|publisher|publishing|magazine|publication|newsletter)\b/i],
  ["blog", /\bblog/i],
];

/** Maps what a user typed ("SaaS", "Dental clinic", "Online shop") to a family. */
export function normalizeBusinessType(...texts: Array<string | null | undefined>): BusinessFamily | null {
  const text = texts.filter(Boolean).join(" ").trim();
  if (!text) return null;
  for (const [family, pattern] of FAMILY_PATTERNS) {
    if (pattern.test(text)) return family;
  }
  return "other";
}

const SCHEMA_FAMILY: Array<[BusinessFamily, RegExp]> = [
  ["saas", /^(SoftwareApplication|WebApplication|MobileApplication)$/],
  [
    "local-service",
    /^(LocalBusiness|Dentist|MedicalClinic|Physician|Restaurant|CafeOrCoffeeShop|Bakery|HealthAndBeautyBusiness|BeautySalon|HairSalon|ExerciseGym|HomeAndConstructionBusiness|Plumber|Electrician|LegalService|Attorney|Hotel|LodgingBusiness|AutoRepair|RealEstateAgent|Pharmacy|VeterinaryCare)$/,
  ],
  ["ecommerce", /^(Product|Offer|AggregateOffer|Store|OnlineStore|ProductGroup)$/],
  ["media", /^(NewsArticle|NewsMediaOrganization|ReportageNewsArticle)$/],
  ["blog", /^(Blog|BlogPosting)$/],
  ["agency", /^(ProfessionalService|ProfessionalServiceBusiness)$/],
];

export type CompetitorPageFacts = {
  url: string;
  title: string | null;
  h1: string | null;
  metaDescription?: string | null;
  headings: string[];
  schemaTypes: string[];
  pageType: string | null;
};

/** Page types a business publishes to sell, as opposed to publish. */
const COMMERCIAL_PAGE_TYPES = new Set(["homepage", "service", "product", "pricing", "landing", "category"]);

export type CompetitorBusinessProfile = {
  family: BusinessFamily | null;
  /** What decided the family. */
  familyEvidence: string[];
  /** Offering and topic words from titles, H1s, descriptions and headings. */
  terms: Set<string>;
  pagesAnalyzed: number;
  /** Share of analyzed pages that are commercial (homepage, service, product...). */
  commercialShare: number | null;
};

/**
 * What a competitor is, from the pages crawled: the business family its
 * schema.org and page types declare, and the words it describes itself in.
 */
export function profileCompetitorBusiness(pages: CompetitorPageFacts[]): CompetitorBusinessProfile {
  const schemaTypes = new Map<string, number>();
  for (const page of pages) for (const type of new Set(page.schemaTypes)) schemaTypes.set(type, (schemaTypes.get(type) ?? 0) + 1);

  let family: BusinessFamily | null = null;
  const familyEvidence: string[] = [];
  for (const [candidate, pattern] of SCHEMA_FAMILY) {
    const matched = [...schemaTypes.keys()].filter((type) => pattern.test(type));
    if (matched.length > 0) {
      family = candidate;
      familyEvidence.push(`schema.org ${matched.slice(0, 3).join(", ")}`);
      break;
    }
  }
  const types = pages.map((page) => page.pageType ?? "other");
  if (!family) {
    const count = (type: string) => types.filter((value) => value === type).length;
    if (count("product") >= 2) {
      family = "ecommerce";
      familyEvidence.push(`${count("product")} product pages`);
    } else if (count("pricing") >= 1) {
      family = "saas";
      familyEvidence.push("a pricing page");
      // Service pages are not read as "agency": payment and software
      // companies publish them too, and the label would then be wrong.
    } else if (pages.length >= 3 && count("article") >= pages.length / 2) {
      family = "blog";
      familyEvidence.push(`${count("article")} of ${pages.length} pages are articles`);
    }
  }

  const terms = termSet(
    ...pages.flatMap((page) => [titleTopic(page.title), page.h1, page.metaDescription ?? null, page.headings.slice(0, 12).join(" "), pathWords(page.url)]),
  );
  for (const word of GENERIC_BUSINESS_WORDS) terms.delete(word);

  return {
    family,
    familyEvidence,
    terms,
    pagesAnalyzed: pages.length,
    commercialShare: pages.length ? types.filter((type) => COMMERCIAL_PAGE_TYPES.has(type)).length / pages.length : null,
  };
}

function pathWords(url: string): string {
  try {
    return new URL(url).pathname.replace(/[/_.-]+/g, " ");
  } catch {
    return "";
  }
}

/** Words every business uses about itself; they say nothing about what it sells. */
const GENERIC_BUSINESS_WORDS = new Set(
  [...termSet(
    "business businesses company companies service services solution solutions platform product products customer customers team teams help helps manage world leading global provider providers based offer offers need needs every people work working better easy simple support trusted grow growth",
  )],
);

export type SelfBusinessFacts = {
  businessType: string | null;
  industry: string | null;
  description: string | null;
  audience: string | null;
  offerings: string[];
  targetKeywords: string[];
  /** Topic words from your own crawled pages. Used when the business context is thin. */
  siteTerms: Iterable<string>;
};

/** The words that say what you sell: your stated offering first, your site's topics when that is thin. */
export function selfOfferingTerms(self: SelfBusinessFacts): { terms: Set<string>; basis: "business-context" | "your-site" | null } {
  const stated = termSet(...self.offerings, ...self.targetKeywords, self.industry, self.businessType);
  for (const word of GENERIC_BUSINESS_WORDS) stated.delete(word);
  if (stated.size < 3) {
    for (const word of termSet(self.description)) if (!GENERIC_BUSINESS_WORDS.has(word)) stated.add(word);
  }
  if (stated.size >= 3) return { terms: stated, basis: "business-context" };

  const site = new Set([...self.siteTerms].filter((word) => !GENERIC_BUSINESS_WORDS.has(word)));
  for (const word of stated) site.add(word);
  return site.size >= 3 ? { terms: site, basis: "your-site" } : { terms: site, basis: null };
}

/** Topic overlap saturates here: a rival rarely uses every word you do. */
const SIMILARITY_SATURATION = 0.5;
const MIN_COMPETITOR_TERMS = 5;

/**
 * BUSINESS SIMILARITY, 0..1: how much of what you sell the competitor's
 * pages talk about, blended with whether the two are the same kind of
 * business when both kinds are known.
 *
 *   topic  = min(1, share of your offering words on its pages / 0.5)
 *   score  = 0.75 * topic + 0.25 * businessSimilarity(your family, its family)
 *            (topic alone when either family is unknown)
 */
export function measureBusinessSimilarity(input: {
  domain: string;
  self: SelfBusinessFacts;
  competitor: CompetitorBusinessProfile;
}): SignalMeasurement & { fromContent: boolean } {
  const self = selfOfferingTerms(input.self);
  const selfFamily = normalizeBusinessType(input.self.businessType, input.self.industry);
  const evidence = {
    basis: self.basis,
    yourType: selfFamily,
    theirType: input.competitor.family,
    theirTypeEvidence: input.competitor.familyEvidence,
    pagesAnalyzed: input.competitor.pagesAnalyzed,
  };

  if (!self.basis) {
    return {
      score: null,
      fromContent: false,
      evidence,
      reason: "Not enough is known about your business: add your services or products, or crawl your site first.",
    };
  }
  if (input.competitor.pagesAnalyzed === 0 || input.competitor.terms.size < MIN_COMPETITOR_TERMS) {
    return {
      score: null,
      fromContent: false,
      evidence,
      reason: `Too little text on the ${input.domain} pages analyzed to compare what it offers.`,
    };
  }

  const shared = [...self.terms].filter((word) => input.competitor.terms.has(word)).sort();
  const topic = Math.min(1, containment(self.terms, input.competitor.terms) / SIMILARITY_SATURATION);
  const family = businessSimilarity(selfFamily, input.competitor.family);
  const score = family == null ? topic : 0.75 * topic + 0.25 * family;
  return {
    score: Math.round(score * 1000) / 1000,
    fromContent: true,
    reason: null,
    evidence: {
      ...evidence,
      sharedTerms: shared.slice(0, 12),
      sharedCount: shared.length,
      yourTermsChecked: self.terms.size,
      topicOverlap: Math.round(topic * 100) / 100,
      typeMatch: family,
    },
  };
}
