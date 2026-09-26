import { pageRecommendationSchema } from "@seo-maker/ai/schemas";
import {
  type IssueDiff,
  type RecommendationOutcome,
  type RecommendationRecord,
  diffIssues,
  pageKeyOf,
  recommendationOutcomes,
} from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";

/**
 * Re-crawl comparison (Phase 4.7): before -> recommendation -> change -> after.
 *
 * Measures only what a crawl can: whether the condition is still present on
 * the pages both crawls fetched. It never claims a ranking or traffic change,
 * because SEO Maker has no ranking data for the site.
 */

type CrawlRef = { id: string; startedAt: Date };

async function crawlSnapshot(crawlId: string) {
  const pages = await prisma.page.findMany({
    where: { crawlId, status: { in: ["analyzed", "failed"] } },
    select: { url: true, finalUrl: true, issues: { select: { checkId: true, severity: true } } },
  });
  const keys = pages.map((page) => pageKeyOf(page.finalUrl ?? page.url));
  const issues = pages.flatMap((page, index) =>
    page.issues.map((issue) => ({ pageKey: keys[index], checkId: issue.checkId, severity: issue.severity })),
  );
  return { keys, issues };
}

export type Outcomes = {
  diff: IssueDiff | null;
  recommendations: RecommendationOutcome[];
};

/**
 * @param latest  The crawl on screen.
 * @param previous The complete crawl before it, if any.
 */
export async function getOutcomes(projectId: string, latest: CrawlRef, previous: CrawlRef | null): Promise<Outcomes> {
  const [after, before, rows] = await Promise.all([
    crawlSnapshot(latest.id),
    previous ? crawlSnapshot(previous.id) : null,
    prisma.aiResult.findMany({
      where: { projectId, feature: "page-recommendation", status: "ok", pageKey: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { pageKey: true, output: true, createdAt: true },
      take: 500,
    }),
  ]);

  // The newest recommendation per page and check is the one to judge.
  const records = new Map<string, RecommendationRecord>();
  for (const row of rows) {
    const parsed = pageRecommendationSchema.safeParse(row.output);
    if (!parsed.success || !row.pageKey) continue;
    for (const recommendation of parsed.data.recommendations) {
      const key = `${row.pageKey}\u0000${recommendation.checkId}`;
      if (!records.has(key)) {
        records.set(key, { pageKey: row.pageKey, checkId: recommendation.checkId, recommendedAt: row.createdAt });
      }
    }
  }

  return {
    diff: before
      ? diffIssues({ beforePages: before.keys, afterPages: after.keys, before: before.issues, after: after.issues })
      : null,
    recommendations: recommendationOutcomes([...records.values()], {
      startedAt: latest.startedAt,
      pages: after.keys,
      failing: after.issues,
    }),
  };
}
