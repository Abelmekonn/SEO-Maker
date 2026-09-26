/**
 * The crawl step of the competitor pipeline, shared by a manually added
 * competitor (analyze-one) and automatic discovery (discover):
 *
 *   search evidence -> select its important pages -> crawl only those
 *     -> CompetitorPage rows (with why each was chosen)
 *
 * Analysis of what was stored is `analyzeCompetitor` in @seo-maker/ai, which
 * both callers run next.
 */

import type { CompetitorSearchEvidence, CompetitorPageRaw, ProjectSearchContext } from "@seo-maker/ai";
import type { CompetitorPolicy, SelectedPage } from "@seo-maker/core/competitors";
import { termSet } from "@seo-maker/core/site";
import { Prisma, prisma } from "@seo-maker/db";
import { type CompetitorPageAudit, crawlCompetitor } from "../../lib/competitor-crawler.js";

function auditToRow(audit: CompetitorPageAudit, selection: SelectedPage) {
  const raw: CompetitorPageRaw = {
    language: audit.language,
    hreflang: audit.hreflang,
    addressCountries: audit.addressCountries,
    selection: { source: selection.source, reason: selection.reason, query: selection.query, position: selection.position },
  };
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
    headings: audit.headings,
    schema: audit.schemaTypes,
    pageType: audit.pageType,
    rawData: raw as Prisma.InputJsonValue,
    status: "analyzed",
  };
}

export type CrawlOutcome = { selection: SelectedPage[]; blockedByRobots: number; pages: number };

/**
 * Crawls a competitor's important pages and stores them, replacing the
 * pages of its previous crawl. Progress is written to the competitor row.
 */
export async function crawlAndStoreCompetitor(input: {
  competitor: { id: string; domain: string };
  search: CompetitorSearchEvidence;
  context: ProjectSearchContext;
  policy: CompetitorPolicy;
  onSelection?: (selection: SelectedPage[]) => Promise<void>;
  onPage?: (done: number, total: number) => Promise<void>;
}): Promise<CrawlOutcome> {
  const { competitor } = input;
  await prisma.competitor.update({
    where: { id: competitor.id },
    data: { status: "crawling", statusError: null, crawlDone: 0, crawlTotal: input.policy.pageLimit },
  });

  // Its pages that ranked in your searches come first; the words of those
  // searches and your business rank the rest.
  const serp = (input.search.summary?.rows ?? []).map((row) => ({ url: row.url, query: row.query, position: row.position }));
  const terms = new Set([...termSet(input.search.queryTerms.join(" ")), ...input.context.businessTerms]);

  const saved: string[] = [];
  let total = input.policy.pageLimit;
  const result = await crawlCompetitor(competitor.domain, {
    limit: input.policy.pageLimit,
    serp,
    terms,
    onSelection: async (selection) => {
      total = selection.length;
      await prisma.competitor.update({ where: { id: competitor.id }, data: { crawlTotal: total } });
      await input.onSelection?.(selection);
    },
    onPage: async (audit, selection) => {
      const row = auditToRow(audit, selection);
      await prisma.competitorPage.upsert({
        where: { competitorId_url: { competitorId: competitor.id, url: row.url } },
        create: { competitorId: competitor.id, ...row },
        update: row,
      });
      saved.push(row.url);
      await prisma.competitor.update({ where: { id: competitor.id }, data: { crawlDone: saved.length } });
      await input.onPage?.(saved.length, total);
    },
  });

  // Pages from an earlier crawl that were not selected this time.
  await prisma.competitorPage.deleteMany({ where: { competitorId: competitor.id, url: { notIn: saved } } });
  await prisma.competitor.update({
    where: { id: competitor.id },
    data: { status: "analyzing", crawlDone: saved.length, crawlTotal: saved.length, lastCrawledAt: new Date() },
  });
  return { selection: result.selection, blockedByRobots: result.blockedByRobots, pages: saved.length };
}
