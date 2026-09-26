import { syncCompetitorGaps, syncSiteOpportunities } from "@seo-maker/ai";
import {
  type PriorEvidence,
  pageKeysOf,
  priorFromInventory,
  priorFromPages,
  readInventory,
} from "@seo-maker/core/crawl";
import { type PlanLimits, planIdOf, planLimits } from "@seo-maker/core/plan";
import type { CrawlHomepageJob } from "@seo-maker/core/queue";
import {
  onPageCheckIds,
  siteCategoryScore,
  siteSeoScore,
  technicalCheckIds,
  toPageIssues,
} from "@seo-maker/core/scoring";
import { Prisma, prisma, settleUsage } from "@seo-maker/db";
import {
  type CrawlTarget,
  type DiscoveredVia,
  type PageAudit,
  type PageFailure,
  CrawlStoppedError,
  crawlPages,
} from "../lib/crawler.js";
import { watchForStop } from "../lib/stop-signal.js";

export type { CrawlHomepageJob };

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
 *
 * A crawl fetches pages of the site's page inventory (SitePage): the ones the
 * user chose, or its Priority pages. It never discovers or re-classifies a
 * page; that is the discovery job's work.
 */
export async function crawlHomepageJob(data: CrawlHomepageJob) {
  const ref: { crawlId: string | null } = { crawlId: null };
  try {
    await runCrawl(data, ref);
  } finally {
    if (data.usageId) {
      await settleCrawlUsage(data.usageId, data.projectId, ref.crawlId).catch((error) => {
        console.warn(`[crawl ${ref.crawlId ?? "?"}] could not settle usage ${data.usageId}:`, error);
      });
    }
  }
}

/**
 * Charges a crawl only when it produced the results the user now sees: the
 * project points at it and it analysed something. A re-crawl that failed or
 * was stopped leaves the previous results in place and is refunded, and so is
 * a first crawl that could not fetch a single page.
 */
async function settleCrawlUsage(usageId: string, projectId: string, crawlId: string | null) {
  if (!crawlId) {
    await settleUsage(prisma, usageId, "refunded", "the crawl never started");
    return;
  }
  const [project, crawl] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { latestCrawlId: true } }),
    prisma.crawl.findUnique({ where: { id: crawlId }, select: { status: true, analyzed: true, crawled: true } }),
  ]);
  const shown = project?.latestCrawlId === crawlId && Boolean(crawl) && ((crawl?.analyzed ?? 0) > 0 || (crawl?.crawled ?? 0) > 0);
  await settleUsage(prisma, usageId, shown ? "succeeded" : "refunded", shown ? null : `crawl ${crawl?.status ?? "deleted"} with no results`);
}

async function runCrawl(data: CrawlHomepageJob, ref: { crawlId: string | null }) {
  const { projectId, url } = data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`Project ${projectId} was not found.`);
  }

  // The plan is read now, not taken from the job: it can change while the job
  // waits, and nothing a client sends decides how much of a site is analyzed.
  const limits = await limitsForOwner(project.userId);
  const targets = await crawlTargets(projectId, project.rootUrl, data.targets, limits);
  const inventorySize = await prisma.sitePage.count({ where: { projectId } });

  const crawl = await prisma.crawl.create({
    data: { projectId, status: "crawling", phase: "starting", maxPages: targets.length },
  });
  ref.crawlId = crawl.id;

  // The project keeps pointing at its last finished crawl until this one
  // completes. Switching at the start made every screen read a half-finished
  // crawl: the overview showed a few pages and scores that moved while you
  // looked. The live view reads the running crawl directly instead.
  const previousCrawlId = project.latestCrawlId;
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "crawling" },
  });

  let saved = 0;
  let failed = 0;

  // The Stop button marks this row "cancelling". A missing row means the site
  // was deleted mid-crawl, which is a stop too.
  const stop = watchForStop(async () => {
    const row = await prisma.crawl.findUnique({ where: { id: crawl.id }, select: { status: true } });
    return !row || row.status === "cancelling";
  }, 1000);

  // Crawlee's pool abort (on a stop) returns without waiting for requests in
  // flight, so a save can still land afterwards. Every save is tracked and
  // awaited before the crawl is closed out, and none starts once the user has
  // stopped the crawl.
  const inFlight = new Set<Promise<void>>();
  const track = (work: Promise<void>) => {
    inFlight.add(work);
    void work.finally(() => inFlight.delete(work)).catch(() => undefined);
    return work;
  };
  const settle = () => Promise.allSettled([...inFlight]);
  const priorityLimit = Math.min(limits.priorityPages, limits.maxPages);

  try {
    const result = await crawlPages(url, targets, {
      signal: stop.signal,
      classify: classifyContext(project),
      onPhase: async (phase) => {
        await prisma.crawl.update({ where: { id: crawl.id }, data: { phase } });
      },
      onPlan: async (plan) => {
        await prisma.crawl.update({
          where: { id: crawl.id },
          data: {
            discovered: inventorySize,
            queued: plan.seeds,
            seedPlan: {
              ...plan,
              deferred: Math.max(0, inventorySize - plan.seeds),
              priorityLimit,
              live: true,
            } satisfies Prisma.InputJsonValue,
          },
        });
        console.log(
          `[crawl ${crawl.id}] ${plan.priority} Priority and ${plan.standard} Standard pages of ${inventorySize} known${plan.blocked ? `, ${plan.blocked} now blocked by robots.txt` : ""}`,
        );
      },
      onPage: async (audit) => {
        if (stop.signal.aborted) return;
        await track(savePage(projectId, crawl.id, audit, limits));
        saved += 1;
        console.log(`[crawl ${crawl.id}] ${saved}/${targets.length} ${audit.tier} ${audit.url}`);
      },
      onFailure: async (failure) => {
        if (stop.signal.aborted) return;
        await track(saveFailure(projectId, crawl.id, failure, limits));
        failed += 1;
        console.warn(`[crawl ${crawl.id}] failed ${failure.url} (${failure.errorType})`);
      },
    });
    await settle();
    const { carried, dropped } = await carryForward(projectId, previousCrawlId, crawl.id, limits.maxPages);
    if (dropped > 0) {
      console.log(`[crawl ${crawl.id}] ${dropped} earlier pages left the results: the plan holds ${limits.maxPages} crawled pages`);
    }
    await markCrawled(projectId, crawl.id);
    const setAside = (failure: PageFailure) => failureStatus(failure, limits) === "excluded";

    await prisma.crawl.update({
      where: { id: crawl.id },
      data: {
        status: "analyzing",
        phase: "scoring",
        discovered: inventorySize,
        queued: targets.length,
        crawled: result.pages.length,
        // A URL that answers with a PDF or JSON file is not a broken page,
        // and neither is one set aside unanalyzed by the plan.
        failed: result.failures.filter((row) => !setAside(row)).length,
        skipped: result.skipped + result.failures.filter(setAside).length,
        requests: result.requests,
        robotsAudit: result.robotsAudit as unknown as Prisma.InputJsonValue,
        sitemapAudit: result.sitemapAudit as unknown as Prisma.InputJsonValue,
        seedPlan: {
          sections: result.sections,
          // Known pages this crawl did not fetch.
          deferred: Math.max(0, inventorySize - targets.length),
          carried,
          // Earlier pages that no longer fit under the plan's page count.
          dropped,
          duplicates: result.sitemapStats.duplicates,
          disallowed: result.sitemapStats.disallowed,
          offSite: result.sitemapStats.offSite,
          priority: result.pages.filter((page) => page.tier === "priority").length,
          standard: result.pages.filter((page) => page.tier === "standard").length,
          priorityLimit,
        } satisfies Prisma.InputJsonValue,
      },
    });

    await finishCrawl(projectId, crawl.id);
    await pruneHistory(projectId, crawl.id);
    await refreshSiteIntelligence(projectId, crawl.id);
  } catch (error) {
    if (error instanceof CrawlStoppedError || stop.signal.aborted) {
      // Returned, not thrown: a stop is the outcome the user asked for, and a
      // thrown error would make BullMQ run the crawl again.
      await settle();
      await stopCrawl({ projectId, crawlId: crawl.id, previousCrawlId, saved, failed }).catch((stopError) => {
        console.warn(`[crawl ${crawl.id}] could not record the stop:`, stopError);
      });
      console.log(`[crawl ${crawl.id}] stopped by the user after ${saved} pages`);
      return;
    }
    await settle();
    await prisma.page.updateMany({
      where: { crawlId: crawl.id, status: { in: ["pending", "crawling"] } },
      data: { status: "failed", errorType: "crawl-aborted" },
    });
    await prisma.crawl.update({
      where: { id: crawl.id },
      data: {
        status: "failed",
        phase: "failed",
        finishedAt: new Date(),
        error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        crawled: saved,
        failed,
      },
    });
    // A failed re-crawl leaves the last good results in place. A failed first
    // crawl has nothing to fall back to, so its partial pages are shown.
    await prisma.project.update({
      where: { id: projectId },
      data: previousCrawlId
        ? { status: "analyzed" }
        : { status: saved > 0 ? "analyzed" : "failed", latestCrawlId: crawl.id },
    });
    throw error;
  } finally {
    stop.dispose();
  }
}

/**
 * The pages this crawl fetches, each at the tier the inventory stores for it.
 *
 * Read when the crawl runs, not taken from the job: the job names pages, and
 * the plan decides how many and how many of them get a Priority Crawl.
 * Priority pages come first, so a plan cap cuts Standard pages before
 * Priority ones. A site with no inventory yet (crawled before inventories
 * existed and never opened since) gets its homepage.
 */
async function crawlTargets(
  projectId: string,
  rootUrl: string,
  keys: string[] | undefined,
  limits: PlanLimits,
): Promise<CrawlTarget[]> {
  const rows = await prisma.sitePage.findMany({
    where: keys ? { projectId, pageKey: { in: keys } } : { projectId, tier: "priority" },
    // "priority" sorts before "standard"; creation order is discovery's
    // importance order.
    orderBy: [{ tier: "asc" }, { homepage: "desc" }, { createdAt: "asc" }],
    select: { url: true, tier: true, homepage: true, sources: true },
  });
  if (rows.length === 0) {
    if (keys && keys.length > 0) {
      throw new Error("None of the chosen pages are in this site's page inventory.");
    }
    return [{ url: rootUrl, tier: "priority", discoveredVia: "seed" }];
  }
  let priorityLeft = Math.min(limits.priorityPages, limits.maxPages);
  return rows.slice(0, Math.max(1, limits.maxPages)).map((row) => {
    const priority = row.tier === "priority" && priorityLeft > 0;
    if (priority) priorityLeft -= 1;
    return { url: row.url, tier: priority ? "priority" : "standard", discoveredVia: viaOf(row) };
  });
}

function viaOf(row: { homepage: boolean; sources: unknown }): DiscoveredVia {
  if (row.homepage) return "seed";
  const sources = Array.isArray(row.sources) ? row.sources : [];
  if (sources.includes("sitemap")) return "sitemap";
  if (sources.includes("link")) return "link";
  return sources.includes("user") ? "user" : "link";
}

/**
 * Copies into this crawl the previous crawl's pages it did not fetch.
 *
 * A crawl fetches only the pages chosen, but each crawl is still the whole
 * current state of the site: every screen reads the latest crawl, and a
 * comparison sets one crawl against another. A page not chosen keeps its last
 * result and the time it was actually fetched (`createdAt`), so it never reads
 * as fresher than it is. Issues are recomputed for every page when the crawl
 * is scored.
 *
 * A site holds no more crawled pages than the plan crawls: pages carried
 * forward fill only the room the pages fetched now leave under `maxPages`.
 * Priority pages are kept first, then the most recently crawled. A page that
 * does not fit leaves the results and stays in the inventory, uncrawled.
 * Files the last crawl met (a PDF, a JSON file) are not pages and are not
 * carried.
 */
async function carryForward(
  projectId: string,
  previousCrawlId: string | null,
  crawlId: string,
  maxPages: number,
): Promise<{ carried: number; dropped: number }> {
  if (!previousCrawlId) return { carried: 0, dropped: 0 };
  const [previous, fetched, inventory] = await Promise.all([
    prisma.page.findMany({ where: { crawlId: previousCrawlId } }),
    prisma.page.findMany({ where: { crawlId }, select: { url: true, finalUrl: true, evidence: true, errorType: true } }),
    prisma.sitePage.findMany({ where: { projectId }, select: { pageKey: true, tier: true } }),
  ]);
  const done = new Set(fetched.flatMap(pageKeysOf));
  const tierOf = new Map(inventory.map((row) => [row.pageKey, row.tier]));
  const isPriority = (page: (typeof previous)[number]) => pageKeysOf(page).some((key) => tierOf.get(key) === "priority");
  const candidates = previous
    .filter((page) => page.errorType !== NOT_HTML && !pageKeysOf(page).some((key) => done.has(key)))
    .sort((a, b) => Number(isPriority(b)) - Number(isPriority(a)) || b.createdAt.getTime() - a.createdAt.getTime());
  const room = Math.max(0, maxPages - fetched.filter((page) => page.errorType !== NOT_HTML).length);
  const keep = candidates.slice(0, room);
  const drop = candidates.slice(room);

  if (keep.length > 0) {
    const json = (value: Prisma.JsonValue | null) => (value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue));
    await prisma.page.createMany({
      data: keep.map(({ id: _id, crawlId: _crawlId, updatedAt: _updatedAt, evidence, seoSuggestion, ...page }) => ({
        ...page,
        crawlId,
        evidence: json(evidence),
        seoSuggestion: json(seoSuggestion),
      })),
    });
  }
  if (drop.length > 0) {
    await prisma.sitePage.updateMany({
      where: { projectId, pageKey: { in: [...new Set(drop.flatMap(pageKeysOf))] } },
      data: { lastCrawledAt: null },
    });
  }
  return { carried: keep.length, dropped: drop.length };
}

/** Records on the inventory which pages this crawl fetched. */
async function markCrawled(projectId: string, crawlId: string) {
  const pages = await prisma.page.findMany({
    where: { crawlId, status: { not: "pending" } },
    select: { url: true, finalUrl: true, evidence: true, createdAt: true },
  });
  const since = await prisma.crawl.findUnique({ where: { id: crawlId }, select: { startedAt: true } });
  // Carried pages keep their own fetch time and are not counted here.
  const fetched = pages.filter((page) => !since || page.createdAt >= since.startedAt);
  const keys = [...new Set(fetched.flatMap(pageKeysOf))];
  if (keys.length === 0) return;
  await prisma.sitePage.updateMany({
    where: { projectId, pageKey: { in: keys } },
    data: { lastCrawledAt: new Date() },
  });
}

/**
 * Records a crawl the user stopped.
 *
 * A stopped re-crawl is dropped: the last complete crawl stays the one every
 * screen shows, exactly as when a re-crawl fails. A stopped first crawl has
 * nothing to fall back to, so the pages it did fetch are scored and shown,
 * marked as a partial crawl.
 */
async function stopCrawl({
  projectId,
  crawlId,
  previousCrawlId,
  saved,
  failed,
}: {
  projectId: string;
  crawlId: string;
  previousCrawlId: string | null;
  saved: number;
  failed: number;
}) {
  const exists = await prisma.crawl.findUnique({ where: { id: crawlId }, select: { id: true } });
  if (!exists) return; // The site was deleted.

  if (!previousCrawlId && saved > 0) {
    await prisma.crawl.update({ where: { id: crawlId }, data: { crawled: saved, failed } });
    await finishCrawl(projectId, crawlId, { stopped: true });
    await pruneHistory(projectId, crawlId);
    await refreshSiteIntelligence(projectId, crawlId);
    return;
  }

  await prisma.crawl.update({
    where: { id: crawlId },
    data: { status: "cancelled", phase: "cancelled", finishedAt: new Date(), crawled: saved, failed },
  });
  await prisma.project.update({
    where: { id: projectId },
    // A first crawl stopped before it saved a page: the site is ready to crawl again.
    data: { status: previousCrawlId ? "analyzed" : "discovered" },
  });
}

/**
 * Computes and stores the crawl's scores and issue log.
 *
 * Issues come from `toPageIssues`, which is the same deterministic check set
 * the UI renders (Phase 0.4: do not rewrite deterministic scoring). Persisting
 * them means a stored issue can never disagree with a displayed one, and gives
 * the AI layer a record to explain instead of re-deriving.
 */
/** Re-scores a crawl from its page rows, after one of them changed. */
export async function rescoreCrawl(crawlId: string) {
  const pages = await prisma.page.findMany({ where: { crawlId } });
  const issueCount = await prisma.pageIssue.count({ where: { crawlId } });
  await prisma.crawl.update({
    where: { id: crawlId },
    data: {
      issueCount,
      seoScore: siteSeoScore(pages),
      technicalScore: siteCategoryScore(pages, technicalCheckIds),
      onPageScore: siteCategoryScore(pages, onPageCheckIds),
    },
  });
}

export { refreshSiteIntelligence };

async function finishCrawl(projectId: string, crawlId: string, options: { stopped?: boolean } = {}) {
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
      // A stopped first crawl keeps "cancelled" so it reads as partial, and
      // comparisons never set it against a complete crawl.
      status: options.stopped ? "cancelled" : analyzed === 0 && failed > 0 ? "failed" : "completed",
      phase: options.stopped ? "cancelled" : "done",
      finishedAt: new Date(),
      analyzed,
      failed,
      issueCount: issueRows.length,
      seoScore: siteSeoScore(pages),
      technicalScore: siteCategoryScore(pages, technicalCheckIds),
      onPageScore: siteCategoryScore(pages, onPageCheckIds),
    },
  });

  // Only now does the project switch to this crawl, so every screen moves
  // from the previous complete results to the new complete results at once.
  await prisma.project.update({
    where: { id: projectId },
    data: { status: analyzed === 0 && failed > 0 ? "failed" : "analyzed", latestCrawlId: crawlId },
  });
}

/**
 * Re-derives site opportunities and competitor gaps from the crawl that just
 * became current (Phase 3.3, 4.2, 4.7).
 *
 * Deterministic and cheap: no model runs here. Doing it now is what lets the
 * next crawl record which opportunities it no longer finds. It never fails
 * the crawl, whose own results are already saved; the Opportunities page
 * re-derives on view if this did not run.
 */
async function refreshSiteIntelligence(projectId: string, crawlId: string) {
  try {
    const synced = await syncSiteOpportunities(projectId);
    if (!synced) return;
    console.log(
      `[crawl ${crawlId}] ${synced.candidates.length} site opportunities (${synced.created} new, ${synced.resolved} resolved)`,
    );
    const competitors = await prisma.competitor.count({ where: { projectId, status: "ready", excluded: false } });
    if (competitors > 0) {
      await syncCompetitorGaps(projectId, synced.loaded);
    }
  } catch (error) {
    console.warn(`[crawl ${crawlId}] could not refresh site opportunities:`, error);
  }
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

/**
 * A page's row status under the owner's plan.
 *
 * On a plan that analyzes Priority pages only (Free), a Standard page is kept
 * as "excluded": it is in the site inventory, fetched and visible, but no
 * check, score or issue is ever computed for it, here or on any screen.
 */
function pageStatus(tier: PageAudit["tier"], limits: PlanLimits): "analyzed" | "excluded" {
  return tier === "standard" && !limits.analyzeStandardPages ? "excluded" : "analyzed";
}

function failureStatus(failure: PageFailure, limits: PlanLimits): "failed" | "excluded" {
  // A file (stripe.com/apple-app-site-association, a PDF) answering 200 is
  // not a failed page. Stored as "failed" it went through every HTML check
  // and reported seven problems a JSON file cannot have. "excluded" keeps it
  // visible without auditing it.
  if (failure.errorType === NOT_HTML) return "excluded";
  return pageStatus(failure.tier, limits) === "excluded" ? "excluded" : "failed";
}

export async function limitsForOwner(userId: string): Promise<PlanLimits> {
  const account = await prisma.account.findUnique({ where: { userId }, select: { plan: true } });
  return planLimits[planIdOf(account?.plan)];
}

/**
 * What the last completed crawl learned about each URL: page type from the
 * page itself, indexability, status, canonical and internal links. Read by
 * discovery, so a page an earlier crawl read is classified from what it is,
 * not only from its URL. Crawls that stored no inventory fall back to their
 * page rows.
 */
export async function priorEvidence(latestCrawlId: string | null): Promise<Map<string, PriorEvidence>> {
  if (!latestCrawlId) return new Map();
  const stored = await prisma.crawlInventory.findUnique({ where: { crawlId: latestCrawlId }, select: { data: true } });
  const inventory = readInventory(stored?.data);
  if (inventory) return priorFromInventory(inventory);
  const pages = await prisma.page.findMany({
    where: { crawlId: latestCrawlId },
    select: {
      url: true,
      finalUrl: true,
      status: true,
      statusCode: true,
      pageType: true,
      pageTypeScore: true,
      indexable: true,
      canonicalUrl: true,
    },
  });
  return priorFromPages(pages);
}

/** The Page columns a fetched page writes. Shared with the single-page fetch. */
export function pageRowData(audit: PageAudit, limits: PlanLimits) {
  const status = pageStatus(audit.tier, limits);
  return {
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
    searchIntent: audit.searchIntent,
    searchIntentScore: audit.searchIntentScore,
    language: audit.language,
    depth: audit.depth,
    discoveredVia: audit.discoveredVia,
    redirectCount: audit.redirectCount,
    responseTimeMs: audit.responseTimeMs,
    contentType: audit.contentType,
    content: audit.content,
    contentHash: audit.contentHash,
    evidence: audit.evidence as unknown as Prisma.InputJsonValue,
    crawlTier: audit.tier,
    errorType: null,
    error: null,
    status,
  };
}

async function savePage(projectId: string, crawlId: string, audit: PageAudit, limits: PlanLimits) {
  const data = pageRowData(audit, limits);
  const existing = await prisma.page.findFirst({ where: { crawlId, url: audit.url } });
  if (existing) {
    await prisma.page.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.page.create({ data: { projectId, crawlId, ...data } });
}

/** A failed fetch becomes a visible row instead of an absent one. */
/** errorType the crawler gives a URL that served something other than HTML. */
const NOT_HTML = "not-html";

async function saveFailure(projectId: string, crawlId: string, failure: PageFailure, limits: PlanLimits) {
  const data = {
    url: failure.url,
    statusCode: failure.statusCode,
    depth: failure.depth,
    discoveredVia: failure.discoveredVia,
    crawlTier: failure.tier,
    errorType: failure.errorType,
    error: failure.error,
    status: failureStatus(failure, limits),
  };

  const existing = await prisma.page.findFirst({ where: { crawlId, url: failure.url } });
  if (existing) {
    await prisma.page.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.page.create({ data: { projectId, crawlId, ...data } });
}

/**
 * The business's own list of what it sells, for page classification.
 *
 * Only Deep projects carry it. A page named after a listed offering is a
 * product or service page on the user's word, which is stronger evidence than
 * anything the URL alone can say (Phase 2.4).
 */
export function classifyContext(project: {
  analysisMode: string;
  servicesProducts: unknown;
  businessType: string | null;
  pageTypeOverrides?: unknown;
}): { offerings?: string[]; offeringKind?: "product" | "service"; overrides?: Record<string, string> } {
  const overrides =
    project.pageTypeOverrides && typeof project.pageTypeOverrides === "object"
      ? (project.pageTypeOverrides as Record<string, string>)
      : undefined;
  if (project.analysisMode !== "deep" || !Array.isArray(project.servicesProducts)) {
    return { overrides };
  }
  const offerings = project.servicesProducts.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const offeringKind = /service|agency|consult|clinic|studio|firm|practice/i.test(project.businessType ?? "")
    ? "service"
    : "product";
  return { offerings, offeringKind, overrides };
}

/**
 * Closes out crawls a previous worker process left mid-flight.
 *
 * A worker stopped during a crawl (a restart, a closed terminal) leaves its
 * Crawl row at "crawling" forever, and the progress view would wait on it for
 * ever. There is one crawl worker at crawl concurrency 1, so at startup
 * nothing is legitimately running yet: anything still marked running was
 * interrupted. BullMQ re-queues the stalled job itself, which starts a fresh
 * crawl; this only records what happened to the old one.
 */
export async function recoverInterruptedCrawls(): Promise<number> {
  // Discovery runs on the same worker. One left running was interrupted too;
  // if BullMQ runs it again, the job marks itself running again.
  const discoveries = await prisma.project.findMany({ where: { discoveryStatus: "running" }, select: { id: true, discoveryMode: true } });
  for (const project of discoveries) {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        discoveryStatus: "failed",
        discoveryError: "Interrupted: the worker stopped while this site's pages were being discovered.",
        ...(project.discoveryMode === "initial" ? { status: "failed" } : {}),
      },
    });
  }

  const stuck = await prisma.crawl.findMany({
    where: { status: { in: ["crawling", "analyzing", "pending", "cancelling"] } },
    select: { id: true, projectId: true },
  });
  if (stuck.length === 0) return discoveries.length;

  // A crawl the user was stopping when the worker went down is stopped.
  await prisma.crawl.updateMany({
    where: { id: { in: stuck.map((row) => row.id) }, status: "cancelling" },
    data: { status: "cancelled", phase: "cancelled", finishedAt: new Date() },
  });
  await prisma.crawl.updateMany({
    where: { id: { in: stuck.map((row) => row.id) }, status: { not: "cancelled" } },
    data: {
      status: "failed",
      phase: "failed",
      finishedAt: new Date(),
      error: "Interrupted: the worker stopped while this crawl was running.",
    },
  });

  for (const projectId of new Set(stuck.map((row) => row.projectId))) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { latestCrawlId: true, status: true } });
    if (project && project.status === "crawling") {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: project.latestCrawlId ? "analyzed" : "failed" },
      });
    }
  }
  return stuck.length + discoveries.length;
}
