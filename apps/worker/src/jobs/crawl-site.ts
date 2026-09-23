import {
  onPageCheckIds,
  siteCategoryScore,
  siteSeoScore,
  technicalCheckIds,
  toPageIssues,
} from "@seo-maker/core/scoring";
import { type Prisma, prisma } from "@seo-maker/db";
import { type PageAudit, type PageFailure, crawlSite } from "../lib/crawler.js";

export type CrawlHomepageJob = {
  projectId: string;
  pageId: string;
  url: string;
};

/** How many past crawls to keep per project. Older ones are pruned. */
const CRAWL_HISTORY_LIMIT = 10;

/**
 * Runs one crawl and records it as its own `Crawl` row.
 *
 * The previous version reset every page column to null, re-crawled in place,
 * and deleted any page that was not re-found. That made the product's own
 * Fix -> Re-crawl -> Measure loop impossible: there was never a previous state
 * left to compare against, and any page that failed on the second pass was
 * silently erased rather than reported.
 */
export async function crawlHomepageJob(data: CrawlHomepageJob) {
  const { projectId, url } = data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`Project ${projectId} was not found.`);
  }

  const maxPages = Math.max(1, project.maxPages ?? 1);

  const crawl = await prisma.crawl.create({
    data: { projectId, status: "crawling", maxPages },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "crawling", latestCrawlId: crawl.id },
  });

  let saved = 0;
  let failed = 0;

  try {
    const result = await crawlSite(url, maxPages, {
      onPage: async (audit) => {
        await savePage(projectId, crawl.id, audit);
        saved += 1;
        console.log(`[crawl ${crawl.id}] ${saved}/${maxPages} ${audit.url}`);
      },
      onFailure: async (failure) => {
        await saveFailure(projectId, crawl.id, failure);
        failed += 1;
        console.warn(`[crawl ${crawl.id}] failed ${failure.url} (${failure.errorType})`);
      },
    });

    await prisma.crawl.update({
      where: { id: crawl.id },
      data: {
        status: "analyzing",
        discovered: result.seedPlan.seeds.length + result.seedPlan.deferred,
        queued: result.seedPlan.seeds.length,
        crawled: result.pages.length,
        failed: result.failures.length,
        skipped: result.skipped,
        requests: result.requests,
        robotsAudit: result.robotsAudit as unknown as Prisma.InputJsonValue,
        robotsTxt: result.robotsTxt,
        sitemapAudit: result.sitemapAudit as unknown as Prisma.InputJsonValue,
        seedPlan: {
          sections: result.seedPlan.sections,
          deferred: result.seedPlan.deferred,
          duplicates: result.seedPlan.duplicates,
          disallowed: result.seedPlan.disallowed,
          offSite: result.seedPlan.offSite,
        } satisfies Prisma.InputJsonValue,
      },
    });

    await finishCrawl(projectId, crawl.id);
    await pruneHistory(projectId, crawl.id);
  } catch (error) {
    await prisma.page.updateMany({
      where: { crawlId: crawl.id, status: { in: ["pending", "crawling"] } },
      data: { status: "failed", errorType: "crawl-aborted" },
    });
    await prisma.crawl.update({
      where: { id: crawl.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        crawled: saved,
        failed,
      },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { status: saved > 0 ? "analyzed" : "failed" },
    });
    throw error;
  }
}

/**
 * Computes and stores the crawl's scores and issue log.
 *
 * Issues come from `toPageIssues`, which is the same deterministic check set
 * the UI renders (Phase 0.4: do not rewrite deterministic scoring). Persisting
 * them means a stored issue can never disagree with a displayed one, and gives
 * the AI layer a record to explain instead of re-deriving.
 */
async function finishCrawl(projectId: string, crawlId: string) {
  const pages = await prisma.page.findMany({ where: { crawlId } });

  const issueRows: Prisma.PageIssueCreateManyInput[] = [];
  for (const page of pages) {
    for (const issue of toPageIssues(page)) {
      issueRows.push({ pageId: page.id, crawlId, ...issue });
    }
  }

  await prisma.pageIssue.deleteMany({ where: { crawlId } });
  if (issueRows.length > 0) {
    await prisma.pageIssue.createMany({ data: issueRows, skipDuplicates: true });
  }

  const analyzed = pages.filter((page) => page.status === "analyzed").length;
  const failed = pages.filter((page) => page.status === "failed").length;

  await prisma.crawl.update({
    where: { id: crawlId },
    data: {
      status: analyzed === 0 && failed > 0 ? "failed" : "completed",
      finishedAt: new Date(),
      analyzed,
      failed,
      issueCount: issueRows.length,
      seoScore: siteSeoScore(pages),
      technicalScore: siteCategoryScore(pages, technicalCheckIds),
      onPageScore: siteCategoryScore(pages, onPageCheckIds),
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: analyzed === 0 && failed > 0 ? "failed" : "analyzed" },
  });
}

/**
 * Keeps the last N crawls and deletes the rest.
 *
 * Pages and issues cascade with their crawl, so history has a bounded cost
 * while still supporting the before/after comparison the product loop needs.
 */
async function pruneHistory(projectId: string, keepCrawlId: string) {
  const old = await prisma.crawl.findMany({
    where: { projectId },
    orderBy: { startedAt: "desc" },
    select: { id: true },
    skip: CRAWL_HISTORY_LIMIT,
  });

  const removable = old.map((row) => row.id).filter((id) => id !== keepCrawlId);
  if (removable.length > 0) {
    await prisma.crawl.deleteMany({ where: { id: { in: removable } } });
  }

  // Seed rows from project creation carry no crawl and would otherwise linger
  // as permanently "pending" pages in every listing.
  await prisma.page.deleteMany({ where: { projectId, crawlId: null } });
}

async function savePage(projectId: string, crawlId: string, audit: PageAudit) {
  const data = {
    url: audit.url,
    finalUrl: audit.finalUrl,
    isHttps: audit.isHttps,
    statusCode: audit.statusCode,
    title: audit.title,
    metaDesc: audit.metaDesc,
    h1: audit.h1,
    h1Count: audit.h1Count,
    h2Count: audit.h2Count,
    h3Count: audit.h3Count,
    canonicalUrl: audit.canonicalUrl,
    wordCount: audit.wordCount,
    imageCount: audit.imageCount,
    missingAlt: audit.missingAlt,
    internalLinks: audit.internalLinks,
    externalLinks: audit.externalLinks,
    schemaCount: audit.schemaCount,
    robotsTxtUrl: audit.robotsTxtUrl,
    robotsOk: audit.robotsOk,
    sitemapUrl: audit.sitemapUrl,
    hasSitemap: audit.hasSitemap,
    xRobotsTag: audit.xRobotsTag,
    robotsMeta: audit.robotsMeta,
    indexable: audit.indexable,
    inSitemap: audit.inSitemap,
    robotsDisallowed: audit.robotsDisallowed,
    pageType: audit.pageType,
    pageTypeScore: audit.pageTypeScore,
    language: audit.language,
    depth: audit.depth,
    discoveredVia: audit.discoveredVia,
    redirectCount: audit.redirectCount,
    responseTimeMs: audit.responseTimeMs,
    contentType: audit.contentType,
    content: audit.content,
    contentHash: audit.contentHash,
    evidence: audit.evidence as unknown as Prisma.InputJsonValue,
    errorType: null,
    error: null,
    status: "analyzed",
  };

  const existing = await prisma.page.findFirst({ where: { crawlId, url: audit.url } });
  if (existing) {
    await prisma.page.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.page.create({ data: { projectId, crawlId, ...data } });
}

/** A failed fetch becomes a visible row instead of an absent one. */
async function saveFailure(projectId: string, crawlId: string, failure: PageFailure) {
  const data = {
    url: failure.url,
    statusCode: failure.statusCode,
    depth: failure.depth,
    discoveredVia: failure.discoveredVia,
    errorType: failure.errorType,
    error: failure.error,
    status: "failed",
  };

  const existing = await prisma.page.findFirst({ where: { crawlId, url: failure.url } });
  if (existing) {
    await prisma.page.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.page.create({ data: { projectId, crawlId, ...data } });
}
