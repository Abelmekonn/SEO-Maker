import { prisma } from "@seo-maker/db";
import { runPageSpeed, type PageSpeedResult, type Strategy } from "../lib/pagespeed";

export type RunPerformanceJob = {
  projectId: string;
  pageId: string;
  url: string;
};

const strategies: Strategy[] = ["mobile", "desktop"];

export async function runPerformanceJob(data: RunPerformanceJob) {
  const { projectId, pageId, url } = data;

  await prisma.project.update({
    where: { id: projectId },
    data: { perfStatus: "running", perfError: null },
  });

  const errors: string[] = [];
  let saved = 0;

  // Run one strategy at a time so a failure in one does not discard the other,
  // and so we stay under the per-100-seconds quota on the API key.
  for (const strategy of strategies) {
    try {
      const result = await runPageSpeed(url, strategy);
      await saveResult(pageId, result);
      saved += 1;
      console.log(
        `Performance ${strategy}: perf ${result.performance ?? "-"}, seo ${result.seo ?? "-"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${strategy}: ${message}`);
      console.error(`Performance ${strategy} failed:`, message);
    }
  }

  if (saved === 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: { perfStatus: "failed", perfError: errors.join(" ") },
    });
    throw new Error(errors.join(" "));
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

async function saveResult(pageId: string, result: PageSpeedResult) {
  await prisma.$transaction([
    prisma.performanceAudit.deleteMany({ where: { pageId, strategy: result.strategy } }),
    prisma.performanceAudit.create({
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
        rawData: result.rawData as object,
        opportunities: result.opportunities,
        diagnostics: result.diagnostics,
      },
    }),
  ]);
}
