import type { CompetitorAnalyzeOneJob } from "@seo-maker/core/queue";
import {
  type AuditablePage,
  competitorConfidence,
  weightedSeoScore,
} from "@seo-maker/core/scoring";
import { prisma } from "@seo-maker/db";
import { crawlCompetitor } from "../../lib/competitor-crawler.js";
import type { PageAudit } from "../../lib/crawler.js";

const MAX_COMPETITOR_PAGES = 25;

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

function auditToRow(audit: PageAudit) {
  return {
    url: audit.url,
    finalUrl: audit.finalUrl,
    isHttps: audit.isHttps,
    statusCode: audit.statusCode,
    title: audit.title,
    metaDescription: audit.metaDesc,
    h1: audit.h1,
    h2Count: audit.h2Count,
    canonicalUrl: audit.canonicalUrl,
    wordCount: audit.wordCount,
    imageCount: audit.imageCount,
    missingAlt: audit.missingAlt,
    internalLinks: audit.internalLinks,
    schemaCount: audit.schemaCount,
    indexable: audit.indexable,
    xRobotsTag: audit.xRobotsTag,
    status: "analyzed",
  };
}

/**
 * Crawls one competitor and writes its SEO score.
 *
 * Confidence is recomputed here too, but from whatever SERP evidence already
 * exists — a manually added competitor legitimately has none, and the scorer
 * reports the missing signals rather than inventing them.
 */
export async function competitorAnalyzeOneJob(data: CompetitorAnalyzeOneJob) {
  const competitor = await prisma.competitor.findFirst({
    where: { id: data.competitorId, projectId: data.projectId },
    include: { project: { include: { pages: true } } },
  });
  if (!competitor) {
    throw new Error(`Competitor ${data.competitorId} not found`);
  }

  await prisma.competitor.update({
    where: { id: competitor.id },
    data: {
      status: "crawling",
      statusError: null,
      crawlDone: 0,
      crawlTotal: MAX_COMPETITOR_PAGES,
    },
  });

  const saved: string[] = [];

  try {
    const { pages: audits, blockedByRobots } = await crawlCompetitor(
      competitor.domain,
      MAX_COMPETITOR_PAGES,
      {
        onPage: async (audit) => {
          const row = auditToRow(audit);
          await prisma.competitorPage.upsert({
            where: { competitorId_url: { competitorId: competitor.id, url: row.url } },
            create: { competitorId: competitor.id, ...row },
            update: row,
          });
          saved.push(row.url);
          await prisma.competitor.update({
            where: { id: competitor.id },
            data: { crawlDone: saved.length },
          });
        },
      },
    );

    // Drop pages that vanished since the last crawl.
    await prisma.competitorPage.deleteMany({
      where: { competitorId: competitor.id, url: { notIn: saved } },
    });

    await prisma.competitor.update({
      where: { id: competitor.id },
      data: { status: "analyzing", crawlTotal: audits.length, crawlDone: audits.length },
    });

    const rows = await prisma.competitorPage.findMany({ where: { competitorId: competitor.id } });
    const auditable = rows.map(toAuditablePage);

    // Performance is intentionally omitted: we do not run PageSpeed against
    // third-party sites, so it stays "not measured" and its weight redistributes.
    const seo = weightedSeoScore({ pages: auditable });

    const selfPages = competitor.project.pages.map((page) => ({
      status: page.status,
      url: page.url,
      finalUrl: page.finalUrl,
      statusCode: page.statusCode,
      title: page.title,
      metaDesc: page.metaDesc,
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
    }));

    const serpRows = await prisma.serpResult.findMany({
      where: { domain: competitor.domain, query: { projectId: competitor.projectId } },
      select: { position: true, queryId: true },
    });
    const totalQueries = await prisma.competitorQuery.count({
      where: { projectId: competitor.projectId },
    });

    const confidence = competitorConfidence({
      sharedQueries: new Set(serpRows.map((row) => row.queryId)).size,
      totalQueries,
      positions: serpRows.map((row) => row.position),
      queryRelevance: null,
      businessType: competitor.businessType,
      selfBusinessType: null,
      country: competitor.country,
      language: competitor.language,
      selfCountry: null,
      selfLanguage: null,
      source: (competitor.source as "manual" | "serp" | "ai") ?? "manual",
      classificationConfidence: null,
    });

    const wordCounts = rows.map((row) => row.wordCount).filter((v): v is number => v != null);
    const linkCounts = rows.map((row) => row.internalLinks).filter((v): v is number => v != null);
    const schemaKnown = rows.filter((row) => row.schemaCount != null);

    await prisma.competitorAnalysis.create({
      data: {
        competitorId: competitor.id,
        seoScore: seo.score,
        technicalScore: seo.dimensions.technical,
        onPageScore: seo.dimensions.onPage,
        contentScore: seo.dimensions.content,
        performanceScore: seo.dimensions.performance,
        internalLinksScore: seo.dimensions.internalLinks,
        structuredDataScore: seo.dimensions.structuredData,
        measuredWeights: seo.weights,
        notMeasured: seo.notMeasured,
        confidence: confidence.score,
        confidenceParts: confidence.parts,
        pagesAnalyzed: rows.length,
        avgWordCount: wordCounts.length
          ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length
          : null,
        avgInternalLinks: linkCounts.length
          ? linkCounts.reduce((a, b) => a + b, 0) / linkCounts.length
          : null,
        schemaCoverage: schemaKnown.length
          ? schemaKnown.filter((row) => (row.schemaCount ?? 0) >= 1).length / schemaKnown.length
          : null,
        summary: describeSummary(seo.score, rows.length, blockedByRobots),
        aiUsed: false,
      },
    });

    await prisma.competitor.update({
      where: { id: competitor.id },
      data: {
        status: "ready",
        statusError: null,
        pageCount: rows.length,
        seoScore: seo.score,
        confidence: confidence.score,
        confidenceBand: confidence.band,
        lastCrawledAt: new Date(),
        lastAnalyzedAt: new Date(),
      },
    });

    // Keep the self-score handy for comparison without recomputing it in the UI.
    void selfPages;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Competitor analysis failed.";
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: { status: "failed", statusError: message },
    });
    throw error;
  }
}

function describeSummary(score: number | null, pages: number, blockedByRobots: number) {
  const parts: string[] = [];
  parts.push(
    score == null
      ? `Analyzed ${pages} page${pages === 1 ? "" : "s"}, but there was not enough signal to score this site.`
      : `Scored ${score} out of 100 across ${pages} analyzed page${pages === 1 ? "" : "s"}.`,
  );
  if (blockedByRobots > 0) {
    parts.push(`${blockedByRobots} page${blockedByRobots === 1 ? " was" : "s were"} skipped because robots.txt disallows them.`);
  }
  parts.push("Performance is not measured for competitor sites.");
  return parts.join(" ");
}
