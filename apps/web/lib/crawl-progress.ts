import { prisma } from "@seo-maker/db";
import { failedChecks, pageSeoScore } from "@/lib/page-audit";
import { getCrawlQueueState } from "@/lib/queue";
import { pagePath } from "@/lib/site-url";

/**
 * A live snapshot of a project's crawl, for the progress view and the mini
 * status on every other screen.
 *
 * Reads the running Crawl row and the pages it has saved so far. The project
 * itself keeps pointing at its last finished crawl until this one completes,
 * so nothing else on screen changes mid-crawl.
 */

export type CrawlPhase =
  | "queued"
  | "starting"
  | "discovering"
  | "crawling"
  | "scoring"
  | "done"
  | "failed"
  | "cancelled";

export type CrawlProgress = {
  state: "idle" | "queued" | "running" | "done" | "failed" | "cancelled";
  phase: CrawlPhase;
  /** The user pressed Stop and the worker is winding the crawl down. */
  stopping: boolean;
  crawlId: string | null;
  mode: string;
  maxPages: number;
  startedAt: string | null;
  finishedAt: string | null;
  /**
   * Pages this crawl will fetch. Exact when the sitemap plan fills the page
   * limit; otherwise the limit itself, because the crawler also follows links
   * and the real total is only known when it stops.
   */
  target: number;
  /** True when `target` is the page limit rather than a known count. */
  targetIsCap: boolean;
  done: number;
  failedPages: number;
  pagesPerMinute: number | null;
  etaSeconds: number | null;
  /** Failing checks across the pages saved so far. */
  problems: number;
  plan: {
    sitemapUrls: number;
    sections: number;
    deferred: number;
    robotsFound: boolean;
    crawlDelay: number;
    concurrency: number;
  } | null;
  recent: Array<{
    id: string;
    path: string;
    statusCode: number | null;
    status: string;
    score: number | null;
    issues: number;
    words: number | null;
  }>;
  error: string | null;
  workerOnline: boolean;
  waitingPosition: number | null;
  /** Whether a finished crawl exists to show while this one runs. */
  hasPrevious: boolean;
};

const RUNNING = new Set(["crawling", "analyzing", "pending", "cancelling"]);

export async function getCrawlProgress(project: {
  id: string;
  status: string;
  analysisMode: string;
  maxPages: number;
  latestCrawlId: string | null;
}): Promise<CrawlProgress> {
  const [latest, queue] = await Promise.all([
    prisma.crawl.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: "desc" } }),
    getCrawlQueueState(project.id).catch(() => ({ workerOnline: false, waitingPosition: null })),
  ]);

  const running = latest && RUNNING.has(latest.status) ? latest : null;
  // The job is queued but the worker has not created its Crawl row yet.
  const queued = !running && project.status === "pending";
  const recentFailure =
    latest?.status === "failed" && latest.id !== project.latestCrawlId && !running ? latest : null;
  // A stopped crawl that is not the one on screen: a stopped re-crawl, or a
  // first crawl stopped before it saved a page. A stopped first crawl that did
  // save pages becomes the latest crawl and reads as "done", partial.
  const recentStop =
    latest?.status === "cancelled" && latest.id !== project.latestCrawlId && !running ? latest : null;

  const base: CrawlProgress = {
    state: running
      ? "running"
      : queued
        ? "queued"
        : recentFailure
          ? "failed"
          : recentStop
            ? "cancelled"
            : latest
              ? "done"
              : "idle",
    phase: running
      ? ((running.phase as CrawlPhase) ?? "starting")
      : queued
        ? "queued"
        : recentFailure
          ? "failed"
          : recentStop
            ? "cancelled"
            : "done",
    stopping: running?.status === "cancelling",
    crawlId: (running ?? latest)?.id ?? null,
    mode: project.analysisMode,
    maxPages: running?.maxPages ?? project.maxPages,
    startedAt: (running ?? latest)?.startedAt.toISOString() ?? null,
    finishedAt: latest?.finishedAt?.toISOString() ?? null,
    target: 0,
    targetIsCap: true,
    done: 0,
    failedPages: 0,
    pagesPerMinute: null,
    etaSeconds: null,
    problems: 0,
    plan: null,
    recent: [],
    error: recentFailure?.error ?? null,
    workerOnline: queue.workerOnline,
    waitingPosition: queue.waitingPosition,
    hasPrevious: Boolean(project.latestCrawlId && project.latestCrawlId !== running?.id),
  };

  const cap = running?.maxPages ?? project.maxPages;
  const seeds = running?.queued ?? 0;
  base.targetIsCap = !(seeds > 0 && seeds >= cap);
  base.target = base.targetIsCap ? cap : seeds;

  const crawl = running ?? recentFailure ?? recentStop;
  if (!crawl) {
    return base;
  }

  const plan = crawl.seedPlan as Partial<NonNullable<CrawlProgress["plan"]>> | null;
  if (plan && typeof plan.sitemapUrls === "number") {
    base.plan = {
      sitemapUrls: plan.sitemapUrls,
      sections: Number(plan.sections) || 0,
      deferred: Number(plan.deferred) || 0,
      robotsFound: Boolean(plan.robotsFound),
      crawlDelay: Number(plan.crawlDelay) || 0,
      concurrency: Number(plan.concurrency) || 1,
    };
  }

  const pages = await prisma.page.findMany({
    where: { crawlId: crawl.id },
    orderBy: { createdAt: "desc" },
  });

  const saved = pages.filter((page) => page.status === "analyzed" || page.status === "excluded");
  base.done = saved.length;
  base.failedPages = pages.filter((page) => page.status === "failed").length;
  base.problems = saved.reduce((sum, page) => sum + (page.status === "analyzed" ? failedChecks(page).length : 0), 0);
  base.recent = pages.slice(0, 8).map((page) => ({
    id: page.id,
    path: pagePath(page.finalUrl ?? page.url),
    statusCode: page.statusCode,
    status: page.status,
    score: page.status === "analyzed" ? pageSeoScore(page) : null,
    issues: page.status === "analyzed" ? failedChecks(page).length : 0,
    words: page.wordCount,
  }));

  // Pace from the first saved page, so robots.txt and sitemap reading do not
  // drag the rate down. Needs a few pages before it means anything.
  const oldest = pages[pages.length - 1];
  const processed = base.done + base.failedPages;
  if (oldest && processed >= 3) {
    const minutes = Math.max((Date.now() - oldest.createdAt.getTime()) / 60000, 1 / 60);
    base.pagesPerMinute = Math.round(processed / minutes);
    const left = Math.max(0, base.target - processed);
    base.etaSeconds = base.pagesPerMinute > 0 ? Math.round((left / base.pagesPerMinute) * 60) : null;
  }

  return base;
}
