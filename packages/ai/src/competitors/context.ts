/**
 * The project as competitor work sees it: its business profile, the market
 * its searches are checked in, its language, and the words that say what it
 * sells. Search keywords, discovery and every competitor analysis read this
 * one shape, so they can never disagree about the business.
 */

import {
  type BusinessFamily,
  type BusinessScope,
  type Country,
  type DiscoveryProfile,
  type Market,
  type ProfileGap,
  type SelfBusinessFacts,
  brandTerms,
  businessScope,
  discoveryProfileGaps,
  mostCommon,
  normalizeBusinessType,
  primaryLanguage,
  registrableDomain,
  resolveMarket,
  selfOfferingTerms,
  serpLocationCode,
} from "@seo-maker/core/competitors";
import { termSet, titleTopic } from "@seo-maker/core/site";
import { type Project, prisma } from "@seo-maker/db";

export type SearchMarket = {
  country: Country;
  /** Google location id the searches are checked in. */
  locationCode: number;
  /** ISO 639-1 language of the searches. */
  languageCode: string;
  scope: BusinessScope;
};

export type ProjectSearchContext = {
  project: Project;
  profile: DiscoveryProfile;
  /** What the profile lacks before competitors can be searched for. Empty when complete. */
  gaps: ProfileGap[];
  market: Market;
  /** Null when the target location names no country: searches cannot be checked. */
  searchMarket: SearchMarket | null;
  family: BusinessFamily | null;
  scope: BusinessScope;
  /** Your site's language, from its crawled pages. */
  siteLanguage: string | null;
  /** The registrable domain of your site. */
  selfDomain: string;
  self: SelfBusinessFacts;
  /** Words to score a search's relevance against: offering, context and site topics. */
  businessTerms: Set<string>;
  brandTerms: string[];
  /** A few of your pages, for the query prompt. */
  pages: Array<{ path: string; title: string | null; h1: string | null }>;
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

export function profileOf(project: Project): DiscoveryProfile {
  return {
    name: project.businessName ?? project.name,
    businessType: project.businessType,
    industry: project.industry,
    businessDescription: project.businessDescription,
    targetAudience: project.targetAudience,
    targetLocation: project.targetLocation,
    servicesProducts: strings(project.servicesProducts),
  };
}

export async function loadProjectSearchContext(projectId: string): Promise<ProjectSearchContext | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const pages = project.latestCrawlId
    ? await prisma.page.findMany({
        where: { crawlId: project.latestCrawlId, status: "analyzed" },
        select: { url: true, finalUrl: true, title: true, h1: true, language: true, depth: true, pageType: true },
        orderBy: [{ depth: "asc" }, { createdAt: "asc" }],
        take: 60,
      })
    : [];

  const profile = profileOf(project);
  const market = resolveMarket(project.targetLocation);
  const gaps = discoveryProfileGaps(profile, market);
  const family = normalizeBusinessType(project.businessType, project.industry);
  const scope = businessScope({ family, market });
  const siteLanguage = mostCommon(pages.map((page) => primaryLanguage(page.language)));
  const searchMarket: SearchMarket | null = market.country
    ? {
        country: market.country,
        locationCode: serpLocationCode(market.country),
        // The site's own language first: an English site in Ethiopia is
        // searched for in English, not in the country's first language.
        languageCode: siteLanguage ?? market.country.language,
        scope,
      }
    : null;

  const siteTerms = termSet(...pages.flatMap((page) => [titleTopic(page.title), page.h1]));
  const self: SelfBusinessFacts = {
    businessType: project.businessType,
    industry: project.industry,
    description: project.businessDescription,
    audience: project.targetAudience,
    offerings: strings(project.servicesProducts),
    targetKeywords: strings(project.targetKeywords),
    siteTerms,
  };
  const businessTerms = new Set([...selfOfferingTerms(self).terms, ...termSet(project.businessDescription), ...siteTerms]);

  return {
    project,
    profile,
    gaps,
    market,
    searchMarket,
    family,
    scope,
    siteLanguage,
    selfDomain: registrableDomain(hostOf(project.rootUrl)),
    self,
    businessTerms,
    // A brand that is also a word for what you sell ("payments.com") would
    // remove every real search, so such a word is not treated as a brand.
    brandTerms: brandTerms({ businessName: project.businessName, domain: registrableDomain(hostOf(project.rootUrl)) }).filter(
      (term) => term.includes(" ") || !selfOfferingTerms(self).terms.has(termSet(term).values().next().value ?? term),
    ),
    pages: pages.slice(0, 8).map((page) => ({ path: pathOf(page.finalUrl ?? page.url), title: page.title, h1: page.h1 })),
  };
}
