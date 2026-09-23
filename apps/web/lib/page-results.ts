import { pageKeyOf } from "@seo-maker/core/crawl";
import { Prisma, prisma, type PerformanceAudit } from "@seo-maker/db";

/**
 * PageSpeed and AI results belong to a page's URL, not to one crawl's page row.
 *
 * Every crawl writes new Page rows, so results looked up by row id vanished at
 * the next crawl. They are stored under `pageKey` (see pageKeyOf) and read here
 * by the keys of the pages on screen, then mapped back onto those pages' ids.
 */

type PageLike = { id: string; url: string; finalUrl: string | null };

/** The key a page row's results are stored under. */
export function keyOfPage(page: { url: string; finalUrl: string | null }): string {
  return pageKeyOf(page.finalUrl ?? page.url);
}

/** Key -> the current crawl's page id, and the reverse. */
export function pageKeyIndex(pages: PageLike[]) {
  const idByKey = new Map<string, string>();
  const keyById = new Map<string, string>();
  for (const page of pages) {
    const key = keyOfPage(page);
    // First row wins: a crawl never stores the same URL twice, but a seed row
    // and a crawled row can share one.
    if (!idByKey.has(key)) idByKey.set(key, page.id);
    keyById.set(page.id, key);
  }
  return { idByKey, keyById };
}

/**
 * The newest PageSpeed run per page and device.
 *
 * DISTINCT ON reads one row per (pageKey, strategy) straight off the
 * (projectId, pageKey, strategy, createdAt) index, so the cost stays flat as
 * runs accumulate across crawls instead of loading every run ever made.
 */
export async function latestAudits(projectId: string, keys: string[]): Promise<PerformanceAudit[]> {
  if (keys.length === 0) return [];
  return prisma.$queryRaw<PerformanceAudit[]>`
    SELECT DISTINCT ON ("pageKey", "strategy") *
    FROM "PerformanceAudit"
    WHERE "projectId" = ${projectId} AND "pageKey" IN (${Prisma.join(keys)})
    ORDER BY "pageKey", "strategy", "createdAt" DESC`;
}

export type AuditPoint = {
  createdAt: Date;
  strategy: string;
  performance: number | null;
  lcp: number | null;
  cls: number | null;
};

/** One page's runs over time, small columns only, for trend charts. */
export function auditHistory(projectId: string, pageKey: string, take = 24): Promise<AuditPoint[]> {
  return prisma.performanceAudit.findMany({
    where: { projectId, pageKey },
    orderBy: { createdAt: "desc" },
    take,
    select: { createdAt: true, strategy: true, performance: true, lcp: true, cls: true },
  });
}
