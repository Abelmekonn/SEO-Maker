import { pageKeyOf } from "@seo-maker/core/crawl";
import { incrementPerfDone, prisma, writePerfProgress } from "@seo-maker/db";
import { runPageSpeed, type PageSpeedResult, type Strategy } from "../lib/pagespeed";
import { watchForStop } from "../lib/stop-signal";

export type PerfPageTarget = {
  pageId: string;
  url: string;
};

export type RunPerformanceJob = {
  projectId: string;
  pages?: PerfPageTarget[];
  pageId?: string;
  url?: string;
};

const strategies: Strategy[] = ["mobile", "desktop"];

export async function runPerformanceJob(data: RunPerformanceJob) {
  const { projectId } = data;
  const pages = jobPages(data);

  if (pages.length === 0) {
    throw new Error("Performance job has no pages.");
  }

  // Stop pressed between the web queuing this and the worker taking it.
  const started = await prisma.project.updateMany({
    where: { id: projectId, perfStatus: { not: "cancelling" } },
    data: {
      perfStatus: "running",
      perfError: null,
    },
  });
  if (started.count === 0) {
    await prisma.project.updateMany({
      where: { id: projectId, perfStatus: "cancelling" },
      data: { perfStatus: "cancelled" },
    });
    return;
  }
  await writePerfProgress(prisma, projectId, {
    done: 0,
    total: pages.length,
    pageIds: pages.map((page) => page.pageId),
  });

  // The Stop button marks the project "cancelling". A missing project was
  // deleted mid-run, which is a stop too.
  const stop = watchForStop(async () => {
    const row = await prisma.project.findUnique({ where: { id: projectId }, select: { perfStatus: true } });
    return !row || row.perfStatus === "cancelling";
  });

  const errors: string[] = [];
  let pagesSaved = 0;

  try {
    for (const [index, page] of pages.entries()) {
      if (stop.signal.aborted) break;
      console.log(`Performance page ${index + 1}/${pages.length}: ${page.url}`);
      const pageErrors: string[] = [];
      let saved = 0;

      for (const strategy of strategies) {
        if (stop.signal.aborted) break;
        try {
          const result = await runPageSpeed(page.url, strategy, stop.signal);
          await saveResult(projectId, page, result);
          saved += 1;
          console.log(
            `Performance ${strategy}: perf ${result.performance ?? "-"}, seo ${result.seo ?? "-"}`,
          );
        } catch (error) {
          if (stop.signal.aborted) break;
          const message = error instanceof Error ? error.message : String(error);
          pageErrors.push(`${strategy}: ${message}`);
          console.error(`Performance ${strategy} failed:`, message);
        }
      }

      if (saved > 0) {
        pagesSaved += 1;
      }
      // A page cut short by the stop is not counted as measured.
      if (stop.signal.aborted) break;
      if (pageErrors.length > 0) {
        errors.push(`${page.url}: ${pageErrors.join(" ")}`);
      }

      await incrementPerfDone(prisma, projectId);
    }
  } finally {
    stop.dispose();
  }

  if (stop.signal.aborted) {
    // Results already measured are kept; "cancelled" tells the page how far
    // the run got (perfDone of perfTotal) instead of reporting a failure.
    await prisma.project.updateMany({
      where: { id: projectId },
      data: {
        perfStatus: "cancelled",
        perfError: null,
        ...(pagesSaved > 0 ? { perfRunAt: new Date() } : {}),
      },
    });
    console.log(`Performance for ${projectId}: stopped by the user after ${pagesSaved} pages`);
    return;
  }

  if (pagesSaved === 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: { perfStatus: "failed", perfError: errors.join(" ") },
    });
    return;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      perfStatus: "done",
      perfError: errors.length > 0 ? errors.join(" ") : null,
      perfRunAt: new Date(),
    },
  });
}

function jobPages(data: RunPerformanceJob): PerfPageTarget[] {
  if (Array.isArray(data.pages) && data.pages.length > 0) {
    return data.pages;
  }
  if (data.pageId && data.url) {
    return [{ pageId: data.pageId, url: data.url }];
  }
  return [];
}

/**
 * Runs kept per page and device. Results outlive the crawl that produced them
 * (they are read by page key), so this, not crawl pruning, bounds history:
 * enough for the trend chart, and a hard ceiling on what a page load reads.
 */
const RUNS_KEPT = 12;

async function saveResult(projectId: string, page: PerfPageTarget, result: PageSpeedResult) {
  const pageKey = pageKeyOf(page.url);
  await prisma.performanceAudit.create({
    data: {
      projectId,
      pageKey,
      pageId: page.pageId,
      strategy: result.strategy,
      performance: result.performance,
      accessibility: result.accessibility,
      bestPractices: result.bestPractices,
      seo: result.seo,
      fcp: result.fcp,
      lcp: result.lcp,
      cls: result.cls,
      tbt: result.tbt,
      inp: result.inp,
      ttfb: result.ttfb,
      speedIndex: result.speedIndex,
      rawData: result.rawData as object,
      opportunities: result.opportunities,
      diagnostics: result.diagnostics,
    },
  });

  // Uses the (projectId, pageKey, strategy, createdAt) index; at most one row
  // to delete on a steady state.
  const older = await prisma.performanceAudit.findMany({
    where: { projectId, pageKey, strategy: result.strategy },
    orderBy: { createdAt: "desc" },
    skip: RUNS_KEPT,
    select: { id: true },
  });
  if (older.length > 0) {
    await prisma.performanceAudit.deleteMany({ where: { id: { in: older.map((row) => row.id) } } });
  }
}
