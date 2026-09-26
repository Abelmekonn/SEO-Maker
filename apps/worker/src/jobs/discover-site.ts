/**
 * Discovery: find a site's pages and classify them, without crawling them.
 *
 *   initial    a new site: every page found is classified Priority or
 *              Standard and stored. The user then chooses to start the crawl,
 *              which fetches the Priority pages.
 *   new-pages  an existing site: pages not known yet are classified and added.
 *              Known pages keep their classification, and nothing is crawled
 *              until the user asks for it.
 *
 * Classification is deterministic (`UrlInventory`): no model is involved.
 */

import {
  type ClassifiedPage,
  type DiscoverySummary,
  classifyInventory,
  classifyNewPages,
  pageKeysOf,
} from "@seo-maker/core/crawl";
import type { DiscoverSiteJob } from "@seo-maker/core/queue";
import { Prisma, prisma } from "@seo-maker/db";
import { discoverSite } from "../lib/crawler.js";
import { classifyContext, limitsForOwner, priorEvidence } from "./crawl-site.js";

/** New pages listed in the summary a check leaves for the user. The rest are counted. */
const MAX_LISTED = 500;

export async function discoverSiteJob(job: DiscoverSiteJob): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: job.projectId } });
  if (!project) {
    console.warn(`Discovery ${job.projectId}: project not found, skipping.`);
    return;
  }
  const initial = job.mode === "initial";
  await prisma.project.update({
    where: { id: project.id },
    data: {
      discoveryStatus: "running",
      discoveryMode: job.mode,
      discoveryError: null,
      ...(initial ? { status: "discovering" } : {}),
    },
  });

  try {
    const limits = await limitsForOwner(project.userId);
    const priorityLimit = Math.min(limits.priorityPages, limits.maxPages);
    const found = await discoverSite(project.rootUrl, {
      classify: classifyContext(project),
      priorityLimit,
      prior: await priorEvidence(project.latestCrawlId),
    });

    const known = await prisma.sitePage.findMany({
      where: { projectId: project.id },
      select: { pageKey: true, tier: true },
    });
    // A retried first discovery can find pages a failed one already stored:
    // those are known, and keep the classification they have.
    let pages: ClassifiedPage[];
    if (initial && known.length === 0) {
      pages = classifyInventory(found.entries);
    } else {
      const crawled = project.latestCrawlId
        ? await prisma.page.findMany({
            where: { crawlId: project.latestCrawlId },
            select: { url: true, finalUrl: true, evidence: true },
          })
        : [];
      pages = classifyNewPages(found.entries, {
        knownKeys: new Set([...known.map((row) => row.pageKey), ...crawled.flatMap(pageKeysOf)]),
        knownPriority: known.filter((row) => row.tier === "priority").length,
        priorityLimit,
      });
    }

    const now = new Date();
    if (pages.length > 0) {
      await prisma.sitePage.createMany({
        data: pages.map((page) => ({
          projectId: project.id,
          url: page.url,
          pageKey: page.pageKey,
          path: page.path,
          homepage: page.homepage,
          tier: page.tier,
          autoTier: page.autoTier,
          level: page.level,
          pageType: page.pageType,
          reasons: page.reasons as Prisma.InputJsonValue,
          sources: page.sources as Prisma.InputJsonValue,
          inSitemap: page.inSitemap,
          discoveredAt: now,
        })),
        skipDuplicates: true,
      });
    }

    const priority = pages.filter((page) => page.tier === "priority").length;
    const summary: DiscoverySummary = {
      mode: job.mode,
      at: now.toISOString(),
      total: known.length + pages.length,
      priority,
      standard: pages.length - priority,
      added: initial
        ? []
        : pages.slice(0, MAX_LISTED).map((page) => ({
            url: page.url,
            pageKey: page.pageKey,
            path: page.path,
            tier: page.tier,
            pageType: page.pageType,
            level: page.level,
          })),
      addedNotListed: initial ? 0 : Math.max(0, pages.length - MAX_LISTED),
      sitemapUrls: found.sitemapUrls,
      robotsFound: found.robotsFound,
      homepageError: found.homepageError,
      counts: found.summary.counts,
    };

    await prisma.project.update({
      where: { id: project.id },
      data: {
        discoveryStatus: "done",
        discoveryAt: now,
        discoveryResult: summary as unknown as Prisma.InputJsonValue,
        // A first discovery hands over to the user, who starts the crawl.
        ...(initial && !project.latestCrawlId ? { status: "discovered" } : {}),
      },
    });
    console.log(
      `Discovery ${project.id} (${job.mode}): ${pages.length} ${initial ? "pages" : "new pages"}, ${priority} Priority, ${pages.length - priority} Standard`,
    );
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.warn(`Discovery ${project.id} (${job.mode}) failed: ${message}`);
    // Recorded rather than thrown: the user retries from the screen, and a
    // BullMQ retry on top would run the same failing requests again.
    await prisma.project
      .update({
        where: { id: project.id },
        data: {
          discoveryStatus: "failed",
          discoveryError: message,
          ...(initial && !project.latestCrawlId ? { status: "failed" } : {}),
        },
      })
      .catch(() => undefined);
  }
}
