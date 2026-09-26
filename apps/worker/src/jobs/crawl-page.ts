/**
 * One page fetched into the crawl the dashboard shows, and nothing else on
 * the site:
 *
 *   priority-fetch  a Standard page (counts only) the user made Priority:
 *                   fetch its full content now -> checks re-run -> the page
 *                   is ready for Page AI
 *   recrawl         "Crawl page": the page fetched again at its own tier, to
 *                   check a change the user made to it -> checks re-run
 *
 * The page row is updated in place, so its id, and every AI result and
 * performance run tied to its URL, stay put. Neither mode discovers pages or
 * re-classifies anything; a Priority fetch records the user's choice on the
 * page's inventory entry. The plan's Priority cap is checked again here: the
 * job may have waited while the plan changed.
 */

import { type CrawlTier, pageKeysOf } from "@seo-maker/core/crawl";
import { type CrawlPageJob } from "@seo-maker/core/queue";
import { toPageIssues } from "@seo-maker/core/scoring";
import { prisma, settleUsage } from "@seo-maker/db";
import type { DiscoveredVia } from "../lib/crawler.js";
import { fetchPage } from "../lib/fetch-page.js";
import { classifyContext, limitsForOwner, pageRowData, refreshSiteIntelligence, rescoreCrawl } from "./crawl-site.js";

const VIA = new Set<DiscoveredVia>(["seed", "sitemap", "link", "user"]);

export async function crawlPageJob(job: CrawlPageJob): Promise<void> {
  let outcome: { ok: boolean; reason: string | null } = { ok: false, reason: "the page was not fetched" };
  try {
    outcome = await run(job);
  } finally {
    if (job.usageId) {
      await settleUsage(prisma, job.usageId, outcome.ok ? "succeeded" : "refunded", outcome.ok ? null : outcome.reason).catch(
        (error) => console.warn(`Crawl page ${job.pageId}: could not settle usage ${job.usageId}:`, error),
      );
    }
  }
}

async function run(job: CrawlPageJob): Promise<{ ok: boolean; reason: string | null }> {
  const mode = job.mode ?? "priority-fetch";
  const label = mode === "recrawl" ? "Crawl page" : "Priority fetch";
  const page = await prisma.page.findUnique({ where: { id: job.pageId }, include: { project: true } });
  if (!page || page.projectId !== job.projectId) {
    console.warn(`${label} ${job.pageId}: page not found, skipping.`);
    return { ok: false, reason: "page not found" };
  }
  const project = page.project;
  const keys = pageKeysOf(page);
  // A crawl finished while this waited: the page on screen is a newer row.
  if (!page.crawlId || page.crawlId !== project.latestCrawlId) {
    console.log(`${label} ${job.pageId}: a newer crawl replaced this page, skipping.`);
    if (mode === "priority-fetch") await makePriority(project.id, keys);
    return { ok: false, reason: "a newer crawl replaced this page" };
  }

  const limits = await limitsForOwner(project.userId);
  const entry = await prisma.sitePage.findFirst({ where: { projectId: project.id, pageKey: { in: keys } }, select: { tier: true } });
  // Crawl page keeps the page's own tier; a Priority fetch makes it Priority.
  let tier: CrawlTier =
    mode === "priority-fetch" ? "priority" : entry?.tier === "standard" || (!entry && page.crawlTier === "standard") ? "standard" : "priority";

  if (tier === "priority" && page.crawlTier !== "priority") {
    const others = await prisma.page.count({
      where: { crawlId: page.crawlId, crawlTier: "priority", NOT: { id: page.id } },
    });
    if (others >= limits.priorityPages) {
      if (mode === "priority-fetch") {
        console.warn(`${label} ${job.pageId}: the plan's ${limits.priorityPages} Priority pages are in use.`);
        await prisma.page.update({
          where: { id: page.id },
          data: { error: `Your plan includes ${limits.priorityPages} Priority pages per crawl, and they are in use.` },
        });
        return { ok: false, reason: "priority limit" };
      }
      tier = "standard";
    }
  }

  // "Crawl page" marks the row crawling when it is queued; what it was before
  // is read from the row itself, so a failed page is not restored as analyzed.
  const previousStatus =
    page.status !== "crawling"
      ? page.status
      : page.errorType
        ? "failed"
        : page.crawlTier === "standard" && !limits.analyzeStandardPages
          ? "excluded"
          : "analyzed";
  await prisma.page.update({ where: { id: page.id }, data: { status: "crawling", error: null } });

  try {
    const result = await fetchPage(page.finalUrl ?? page.url, {
      tier,
      classify: classifyContext(project),
      siteFacts: {
        robotsTxtUrl: page.robotsTxtUrl,
        robotsOk: page.robotsOk ?? false,
        sitemapUrl: page.sitemapUrl,
        hasSitemap: page.hasSitemap ?? false,
        inSitemap: page.inSitemap,
      },
      depth: page.depth,
      discoveredVia: VIA.has(page.discoveredVia as DiscoveredVia) ? (page.discoveredVia as DiscoveredVia) : "user",
    });

    if (!result.ok) {
      if (mode === "recrawl" && result.statusCode != null) {
        // The page answered, with an error: that is its current state, and
        // what the user needs to see after changing it.
        const failed = await prisma.page.update({
          where: { id: page.id },
          data: {
            status: "failed",
            statusCode: result.statusCode,
            errorType: result.statusCode >= 500 ? "server-error" : "client-error",
            error: result.reason,
            createdAt: new Date(),
          },
        });
        await replaceIssues(failed);
        await afterFetch(project.id, page.crawlId, keys);
        console.warn(`${label} ${job.pageId}: ${result.reason}`);
        return { ok: true, reason: null };
      }
      // Nothing answered: the last evidence stays, and the reason is shown on the page.
      await prisma.page.update({ where: { id: page.id }, data: { status: previousStatus, error: result.reason } });
      console.warn(`${label} ${job.pageId}: ${result.reason}`);
      return { ok: false, reason: result.reason };
    }

    const data = pageRowData(result.audit, limits);
    // Keep the row's own address: the crawl found it at `url`, and results are
    // read by that page's key. A redirect is recorded in finalUrl. The row's
    // time is the fetch's, so the page reads as crawled now.
    const updated = await prisma.page.update({
      where: { id: page.id },
      data: {
        ...data,
        url: page.url,
        finalUrl: result.audit.url !== page.url ? result.audit.url : page.finalUrl,
        createdAt: new Date(),
      },
    });

    await replaceIssues(updated);
    if (mode === "priority-fetch") await makePriority(project.id, keys);
    await afterFetch(project.id, page.crawlId, keys);
    console.log(`${label} ${job.pageId}: ${updated.url} fetched as ${tier} (${updated.wordCount ?? 0} words)`);
    return { ok: true, reason: null };
  } catch (error) {
    await prisma.page
      .update({ where: { id: page.id }, data: { status: previousStatus, error: "The fetch did not finish. Try again." } })
      .catch(() => undefined);
    throw error;
  }
}

async function replaceIssues(page: Parameters<typeof toPageIssues>[0] & { id: string; crawlId: string | null }) {
  const issues = toPageIssues(page);
  await prisma.$transaction([
    prisma.pageIssue.deleteMany({ where: { pageId: page.id } }),
    ...(issues.length
      ? [
          prisma.pageIssue.createMany({
            data: issues.map((issue) => ({ ...issue, pageId: page.id, crawlId: page.crawlId! })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

/** Scores, the inventory's crawl time and site opportunities, after one page changed. */
async function afterFetch(projectId: string, crawlId: string, keys: string[]) {
  await rescoreCrawl(crawlId);
  await prisma.sitePage.updateMany({ where: { projectId, pageKey: { in: keys } }, data: { lastCrawledAt: new Date() } });
  await refreshSiteIntelligence(projectId, crawlId);
}

/** Records the user's choice on the page's inventory entry, so every later crawl fetches it as Priority. */
async function makePriority(projectId: string, keys: string[]) {
  await prisma.sitePage.updateMany({
    where: { projectId, pageKey: { in: keys } },
    data: { tier: "priority", tierSource: "user" },
  });
}
