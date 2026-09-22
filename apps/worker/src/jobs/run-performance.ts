import { incrementPerfDone, prisma, writePerfProgress } from "@seo-maker/db";
import { runPageSpeed, type PageSpeedResult, type Strategy } from "../lib/pagespeed";

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

  await prisma.project.update({
    where: { id: projectId },
    data: {
      perfStatus: "running",
      perfError: null,
    },
  });
  await writePerfProgress(prisma, projectId, {
    done: 0,
    total: pages.length,
    pageIds: pages.map((page) => page.pageId),
  });

  const errors: string[] = [];
  let pagesSaved = 0;

  for (const [index, page] of pages.entries()) {
    console.log(`Performance page ${index + 1}/${pages.length}: ${page.url}`);
    const pageErrors: string[] = [];
    let saved = 0;

    for (const strategy of strategies) {
      try {
        const result = await runPageSpeed(page.url, strategy);
        await saveResult(page.pageId, result);
        saved += 1;
        console.log(
          `Performance ${strategy}: perf ${result.performance ?? "-"}, seo ${result.seo ?? "-"}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pageErrors.push(`${strategy}: ${message}`);
        console.error(`Performance ${strategy} failed:`, message);
      }
    }

    if (saved > 0) {
      pagesSaved += 1;
    }
    if (pageErrors.length > 0) {
      errors.push(`${page.url}: ${pageErrors.join(" ")}`);
    }

    await incrementPerfDone(prisma, projectId);
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

async function saveResult(pageId: string, result: PageSpeedResult) {
  await prisma.performanceAudit.create({
    data: {
      pageId,
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
}
