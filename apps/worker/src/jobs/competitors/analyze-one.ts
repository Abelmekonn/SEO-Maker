import { analyzeCompetitor, getCompetitorSearchEvidence, loadProjectSearchContext } from "@seo-maker/ai";
import { competitorPolicy } from "@seo-maker/core/competitors";
import type { CompetitorAnalyzeOneJob } from "@seo-maker/core/queue";
import { type SerpProvider, createSerpProvider } from "@seo-maker/core/serp";
import { prisma } from "@seo-maker/db";
import { crawlAndStoreCompetitor } from "./pipeline.js";

/**
 * Analyzes one competitor: a competitor the user added, or "Analyze again".
 *
 *   search evidence for its domain (stale searches fetched, when a provider
 *   is configured) -> its important pages crawled -> the shared analysis:
 *   SEO score, and a confidence where every signal is measured or explained
 *
 * The same engine as automatic discovery; only how the competitor was
 * found differs. A manual competitor is measured on the project's own
 * searches, so it does not depend on discovery having run.
 */
export async function competitorAnalyzeOneJob(
  data: CompetitorAnalyzeOneJob,
  deps: { provider?: SerpProvider | null } = {},
) {
  const competitor = await prisma.competitor.findFirst({ where: { id: data.competitorId, projectId: data.projectId } });
  if (!competitor) {
    throw new Error(`Competitor ${data.competitorId} not found`);
  }
  const policy = competitorPolicy();

  try {
    const context = await loadProjectSearchContext(competitor.projectId);
    if (!context) throw new Error(`Project ${competitor.projectId} not found`);
    const search = await getCompetitorSearchEvidence({
      projectId: competitor.projectId,
      competitorDomain: competitor.domain,
      refresh: true,
      ttlHours: policy.serpTtlHours,
      depth: policy.serpDepth,
      provider: deps.provider === undefined ? createSerpProvider() : deps.provider,
      context,
    });
    const crawl = await crawlAndStoreCompetitor({ competitor, search, context, policy });
    const result = await analyzeCompetitor({ competitorId: competitor.id, search, context, blockedByRobots: crawl.blockedByRobots });
    console.log(
      `Competitor ${competitor.domain}: ${crawl.pages} pages, confidence ${result.confidence.confidence ?? "not scored"} (${result.confidence.measuredSignalCount} of ${result.confidence.totalSignalCount} signals)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Competitor analysis failed.";
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: { status: "failed", statusError: message },
    });
    throw error;
  }
}
