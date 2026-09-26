/**
 * The competitor analysis engine, shared by manual competitors and
 * automatic discovery. Only how a competitor was found differs; from here
 * on both are measured the same way:
 *
 *   stored competitor pages (the crawler wrote them)
 *     + search evidence (getCompetitorSearchEvidence)
 *     + your business profile and site
 *       -> SEO score of its pages (weightedSeoScore)
 *       -> business profile, market profile
 *       -> confidence (calculateCompetitorConfidence): every signal measured
 *          or explained
 *       -> one CompetitorAnalysis row, the competitor's summary fields
 *       -> comparison with your site and the content gaps (syncCompetitorGaps)
 *
 * No model is called. Everything here is evidence and arithmetic.
 */

import {
  type CompetitorPageFacts,
  type SelectedPage,
  competitorMarketProfile,
  measureBusinessSimilarity,
  measureMarketOverlap,
  profileCompetitorBusiness,
} from "@seo-maker/core/competitors";
import {
  type AuditablePage,
  type CompetitorConfidence,
  type CompetitorSource,
  calculateCompetitorConfidence,
  toStoredConfidence,
  weightedSeoScore,
} from "@seo-maker/core/scoring";
import { Prisma, prisma } from "@seo-maker/db";
import { type ProjectSearchContext, loadProjectSearchContext } from "./context";
import type { CompetitorSearchEvidence } from "./evidence";
import { syncCompetitorGaps } from "./sync";

/** CompetitorPage rows use `metaDescription`; the shared scorer expects `metaDesc`. */
export function toAuditablePage(page: {
  status: string;
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  h2Count: number | null;
  canonicalUrl: string | null;
  wordCount: number | null;
  imageCount: number | null;
  missingAlt: number | null;
  internalLinks: number | null;
  schemaCount: number | null;
  indexable: boolean | null;
  xRobotsTag: string | null;
}): AuditablePage {
  return {
    status: page.status,
    url: page.url,
    finalUrl: page.finalUrl,
    statusCode: page.statusCode,
    title: page.title,
    metaDesc: page.metaDescription,
    h1: page.h1,
    h2Count: page.h2Count,
    canonicalUrl: page.canonicalUrl,
    wordCount: page.wordCount,
    imageCount: page.imageCount,
    missingAlt: page.missingAlt,
    internalLinks: page.internalLinks,
    schemaCount: page.schemaCount,
    indexable: page.indexable,
    xRobotsTag: page.xRobotsTag,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** What the crawler keeps in CompetitorPage.rawData beyond the columns. */
export type CompetitorPageRaw = {
  language?: string | null;
  hreflang?: string[];
  addressCountries?: string[];
  selection?: Pick<SelectedPage, "source" | "reason" | "query" | "position">;
};

export function readPageRaw(value: unknown): CompetitorPageRaw {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const selection = raw.selection && typeof raw.selection === "object" ? (raw.selection as CompetitorPageRaw["selection"]) : undefined;
  return {
    language: typeof raw.language === "string" ? raw.language : null,
    hreflang: strings(raw.hreflang),
    addressCountries: strings(raw.addressCountries),
    selection,
  };
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export type AnalyzeCompetitorResult = {
  analysisId: string;
  confidence: CompetitorConfidence;
  seoScore: number | null;
  pagesAnalyzed: number;
};

/**
 * Analyzes a competitor from what is stored. Crawling is the caller's job:
 * a reused competitor is re-scored here without fetching anything.
 */
export async function analyzeCompetitor(input: {
  competitorId: string;
  search: CompetitorSearchEvidence;
  context?: ProjectSearchContext | null;
  /** Pages robots.txt kept us from, from the crawl that just ran. */
  blockedByRobots?: number;
}): Promise<AnalyzeCompetitorResult> {
  const competitor = await prisma.competitor.findUnique({ where: { id: input.competitorId } });
  if (!competitor) throw new Error(`Competitor ${input.competitorId} not found`);
  const context = input.context ?? (await loadProjectSearchContext(competitor.projectId));
  if (!context) throw new Error(`Project ${competitor.projectId} not found`);

  const rows = await prisma.competitorPage.findMany({ where: { competitorId: competitor.id, status: "analyzed" }, orderBy: { createdAt: "asc" } });
  const seo = weightedSeoScore({ pages: rows.map(toAuditablePage) });

  const facts: CompetitorPageFacts[] = rows.map((row) => ({
    url: row.url,
    title: row.title,
    h1: row.h1,
    metaDescription: row.metaDescription,
    headings: strings(row.headings),
    schemaTypes: strings(row.schema),
    pageType: row.pageType,
  }));
  const raws = rows.map((row) => readPageRaw(row.rawData));
  const business = profileCompetitorBusiness(facts);
  const marketProfile = competitorMarketProfile({
    host: competitor.domain,
    pages: raws.map((raw) => ({ language: raw.language ?? null, hreflang: raw.hreflang ?? [], addressCountries: raw.addressCountries ?? [] })),
  });

  const summary = input.search.summary;
  const confidence = calculateCompetitorConfidence({
    search: summary,
    searchUnavailableReason: input.search.unavailableReason,
    business: measureBusinessSimilarity({ domain: competitor.domain, self: context.self, competitor: business }),
    market: measureMarketOverlap({
      domain: competitor.domain,
      market: context.market,
      scope: context.scope,
      selfLanguage: context.siteLanguage,
      competitor: marketProfile,
      searchAppearances: summary?.appearanceCount ?? 0,
    }),
    source: (["manual", "serp", "ai"].includes(competitor.source) ? competitor.source : "manual") as CompetitorSource,
    classificationConfidence: business.commercialShare,
    classificationEvidence:
      business.commercialShare == null
        ? null
        : {
            commercialPages: Math.round(business.commercialShare * rows.length),
            pagesAnalyzed: rows.length,
            detail: "Share of its analyzed pages that sell (homepage, service, product, pricing, category, landing).",
          },
  });

  const wordCounts = rows.map((row) => row.wordCount).filter((value): value is number => value != null);
  const linkCounts = rows.map((row) => row.internalLinks).filter((value): value is number => value != null);
  const schemaKnown = rows.filter((row) => row.schemaCount != null);

  const analysis = await prisma.competitorAnalysis.create({
    data: {
      competitorId: competitor.id,
      seoScore: seo.score,
      technicalScore: seo.dimensions.technical,
      onPageScore: seo.dimensions.onPage,
      contentScore: seo.dimensions.content,
      performanceScore: seo.dimensions.performance,
      internalLinksScore: seo.dimensions.internalLinks,
      structuredDataScore: seo.dimensions.structuredData,
      // SEO score weights and unmeasured dimensions; the confidence's own
      // weights and reasons travel with its signals in confidenceParts.
      measuredWeights: seo.weights,
      notMeasured: seo.notMeasured,
      confidence: confidence.confidence,
      confidenceParts: toStoredConfidence(confidence) as unknown as Prisma.InputJsonValue,
      pagesAnalyzed: rows.length,
      avgWordCount: average(wordCounts),
      avgInternalLinks: average(linkCounts),
      schemaCoverage: schemaKnown.length ? schemaKnown.filter((row) => (row.schemaCount ?? 0) >= 1).length / schemaKnown.length : null,
      summary: describeSummary({
        domain: competitor.domain,
        score: seo.score,
        pages: rows.length,
        fromSearch: raws.filter((raw) => raw.selection?.source === "serp").length,
        blockedByRobots: input.blockedByRobots ?? 0,
        search: input.search,
      }),
      aiUsed: false,
    },
  });

  const metadata = {
    ...((competitor.metadata && typeof competitor.metadata === "object" ? competitor.metadata : {}) as Record<string, unknown>),
    business: { family: business.family, evidence: business.familyEvidence, commercialShare: business.commercialShare },
    market: marketProfile,
  };
  await prisma.competitor.update({
    where: { id: competitor.id },
    data: {
      status: "ready",
      statusError: null,
      pageCount: rows.length,
      seoScore: seo.score,
      confidence: confidence.confidence,
      confidenceBand: confidence.confidenceBand,
      queryCount: summary?.appearanceCount ?? 0,
      topQueryCount: summary?.top10 ?? 0,
      avgPosition: summary?.avgPosition ?? null,
      country: marketProfile.country,
      language: marketProfile.language,
      businessType: business.family,
      lastAnalyzedAt: new Date(),
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  // The comparison with your site and the gaps shared across competitors are
  // deterministic, so every analysis refreshes them. A failure here must not
  // fail the competitor, whose own results are saved.
  await syncCompetitorGaps(competitor.projectId).catch((error) => {
    console.warn(`Competitor ${competitor.id}: could not refresh the comparison and gaps:`, error);
  });

  return { analysisId: analysis.id, confidence, seoScore: seo.score, pagesAnalyzed: rows.length };
}

function describeSummary(input: {
  domain: string;
  score: number | null;
  pages: number;
  fromSearch: number;
  blockedByRobots: number;
  search: CompetitorSearchEvidence;
}) {
  const parts: string[] = [];
  parts.push(
    `Analyzed ${input.pages} selected page${input.pages === 1 ? "" : "s"} of ${input.domain}` +
      (input.fromSearch > 0 ? `, ${input.fromSearch} of them found in your searches.` : "."),
  );
  const summary = input.search.summary;
  if (summary) {
    parts.push(
      summary.appearanceCount > 0
        ? `Observed in ${summary.appearanceCount} of ${summary.queriesChecked} searches checked, ${summary.top10} of them in the top 10.`
        : `Not found in any of the ${summary.queriesChecked} searches checked.`,
    );
  }
  if (input.score != null) parts.push(`On-page SEO score of the analyzed pages: ${input.score} out of 100.`);
  if (input.blockedByRobots > 0) {
    parts.push(`${input.blockedByRobots} page${input.blockedByRobots === 1 ? " was" : "s were"} skipped because robots.txt disallows them.`);
  }
  parts.push("Performance is not measured for competitor sites.");
  return parts.join(" ");
}
