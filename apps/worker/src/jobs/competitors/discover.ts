/**
 * Automatic competitor discovery: one strongest competitor per run.
 *
 *   business profile -> search queries -> search results for each
 *     -> candidates aggregated across every search -> the strongest recurring one
 *     -> already tracked and freshly crawled?  reuse it: no crawl
 *        otherwise                              select its important pages,
 *                                               crawl them, analyze
 *
 * Every phase is written to the project row as it runs, and a phase that did
 * not need to run is recorded as skipped, never shown as done work.
 */

import {
  type CompetitorSearchEvidence,
  analyzeCompetitor,
  getCompetitorSearchEvidence,
  planForProject,
  resolveDiscoveredCompetitor,
  runDiscoverySearch,
} from "@seo-maker/ai";
import {
  type CompetitorPolicy,
  type DiscoveryOutcome,
  type DiscoveryResult,
  competitorPolicy,
  discoveryMessage,
} from "@seo-maker/core/competitors";
import { planLimits } from "@seo-maker/core/plan";
import { COMPETITOR_PHASES, type CompetitorDiscoverJob, type CompetitorPhase } from "@seo-maker/core/queue";
import { type SerpProvider, createSerpProvider } from "@seo-maker/core/serp";
import { prisma, resetCompetitorProgress, setCompetitorStatus, writeCompetitorPhase, writeCompetitorResult } from "@seo-maker/db";
import { type GenerationOutcome, settleGeneration } from "../ai/settle.js";
import { crawlAndStoreCompetitor } from "./pipeline.js";

export type DiscoverDeps = {
  provider?: SerpProvider | null;
  policy?: CompetitorPolicy;
  now?: () => Date;
};

export async function competitorDiscoverJob(job: CompetitorDiscoverJob, deps: DiscoverDeps = {}): Promise<DiscoveryResult | null> {
  const outcomes: GenerationOutcome[] = [];
  try {
    return await discover(job, deps, outcomes);
  } finally {
    await settleGeneration(job.usageId, outcomes);
  }
}

async function discover(job: CompetitorDiscoverJob, deps: DiscoverDeps, outcomes: GenerationOutcome[]): Promise<DiscoveryResult | null> {
  const { projectId } = job;
  const policy = deps.policy ?? competitorPolicy();
  const provider = deps.provider === undefined ? createSerpProvider() : deps.provider;
  const skipped: CompetitorPhase[] = [];

  await resetCompetitorProgress(prisma, projectId, { status: "running", total: COMPETITOR_PHASES.length, providerOk: provider != null });
  // The previous run's result stops describing the project once a new run starts.
  await writeCompetitorResult(prisma, projectId, null);
  await setCompetitorStatus(prisma, projectId, { status: "running", runAt: new Date(), providerOk: provider != null, total: COMPETITOR_PHASES.length });

  const phase = async (id: CompetitorPhase, done: number, total: number) => {
    await writeCompetitorPhase(prisma, projectId, { phase: id, phaseDone: done, phaseTotal: total, done: COMPETITOR_PHASES.indexOf(id) });
  };
  const fail = async (message: string) => {
    await setCompetitorStatus(prisma, projectId, { status: "failed", error: message, phase: null });
    return null;
  };

  try {
    if (!provider) {
      outcomes.push({ status: "skipped", reason: "no search provider" });
      return await fail("Automatic discovery needs a configured search results provider. You can still add competitors yourself.");
    }

    const search = await runDiscoverySearch({ projectId, provider, policy, onPhase: phase });
    if (search.status === "profile-required") {
      outcomes.push({ status: "skipped", reason: "business profile incomplete" });
      return await fail(`Complete your business profile first: ${search.gaps.map((gap) => gap.label.toLowerCase()).join(", ")}.`);
    }
    if (search.status === "failed") {
      outcomes.push({ status: "failed", reason: search.message });
      return await fail(search.message);
    }
    outcomes.push(search.queriesSource === "generated" ? { status: "generated" } : { status: "cached" });

    const { context, aggregation, strongest, refresh } = search;
    const market = context.searchMarket!;
    const base = {
      runnersUp: aggregation.candidates
        .filter((candidate) => candidate.eligible && candidate.domain !== strongest?.domain)
        .slice(0, 4)
        .map((candidate) => ({ domain: candidate.domain, appearances: candidate.appearances, top10: candidate.top10, bestPosition: candidate.bestPosition, strength: candidate.strength })),
      excluded: aggregation.excluded.slice(0, 6),
      market: { country: market.country.name, locationCode: market.locationCode, languageCode: market.languageCode },
      queries: { source: search.queriesSource, count: search.queryCount, fetched: refresh.fetched, reused: refresh.reused, failed: refresh.failed },
    };
    const finish = async (result: Omit<DiscoveryResult, keyof typeof base | "finishedAt" | "message" | "skippedPhases">) => {
      const full: DiscoveryResult = {
        ...base,
        ...result,
        skippedPhases: skipped,
        message: discoveryMessage({ outcome: result.outcome, domain: result.domain, appearances: result.appearances, queriesChecked: result.queriesChecked }),
        finishedAt: (deps.now?.() ?? new Date()).toISOString(),
      };
      await writeCompetitorResult(prisma, projectId, full);
      await writeCompetitorPhase(prisma, projectId, { phase: "opportunities", phaseDone: 1, phaseTotal: 1, done: COMPETITOR_PHASES.length });
      await setCompetitorStatus(prisma, projectId, { status: "done", phase: null, error: refresh.failed > 0 ? `${refresh.failed} of ${search.queryCount} searches could not be checked.` : null });
      return full;
    };

    if (!strongest) {
      skipped.push("existing", "pages", "crawl", "analyze", "confidence", "opportunities");
      return await finish({
        outcome: "none",
        domain: null,
        competitorId: null,
        queriesChecked: aggregation.queriesChecked,
        appearances: 0,
        top3: 0,
        top10: 0,
        bestPosition: null,
        avgPosition: null,
        strength: null,
        lastAnalyzedAt: null,
        confidenceRefreshed: false,
      });
    }

    await phase("existing", 0, 1);
    const plan = (await planForProject(projectId)) ?? "free";
    const resolved = await resolveDiscoveredCompetitor({
      projectId,
      candidate: strongest,
      maxCompetitors: planLimits[plan].maxCompetitors,
      policy,
      now: deps.now?.(),
    });
    await phase("existing", 1, 1);

    const evidence = (competitorDomain: string): Promise<CompetitorSearchEvidence> =>
      getCompetitorSearchEvidence({
        projectId,
        competitorDomain,
        // The searches were just refreshed above.
        refresh: false,
        ttlHours: policy.serpTtlHours,
        depth: policy.serpDepth,
        provider,
        context,
      });
    const facts = {
      domain: strongest.domain,
      competitorId: resolved.competitor?.id ?? null,
      queriesChecked: strongest.queriesChecked,
      appearances: strongest.appearances,
      top3: strongest.top3,
      top10: strongest.top10,
      bestPosition: strongest.bestPosition,
      avgPosition: strongest.avgPosition,
      strength: strongest.strength,
    };

    if (resolved.decision === "limit-reached" || resolved.decision === "in-progress" || !resolved.competitor) {
      skipped.push("pages", "crawl", "analyze", "confidence", "opportunities");
      return await finish({
        ...facts,
        outcome: resolved.decision === "in-progress" ? "in-progress" : "limit-reached",
        lastAnalyzedAt: resolved.competitor?.lastAnalyzedAt?.toISOString() ?? null,
        confidenceRefreshed: false,
      });
    }

    const competitor = resolved.competitor;
    if (resolved.decision === "reuse") {
      // No crawl. Confidence is recalculated only when this run fetched new
      // search results; otherwise the existing analysis stands as it is.
      skipped.push("pages", "crawl", "analyze");
      if (refresh.fetched === 0) skipped.push("confidence", "opportunities");
      await writeCompetitorResult(prisma, projectId, { inProgress: true, skippedPhases: skipped });
      let confidenceRefreshed = false;
      let lastAnalyzedAt = competitor.lastAnalyzedAt;
      if (refresh.fetched > 0) {
        await phase("confidence", 0, 1);
        await analyzeCompetitor({ competitorId: competitor.id, search: await evidence(competitor.domain), context });
        confidenceRefreshed = true;
        lastAnalyzedAt = new Date();
        await phase("confidence", 1, 1);
      }
      console.log(`Discovery ${projectId}: ${competitor.domain} already tracked, crawl reused`);
      return await finish({ ...facts, outcome: "existing", lastAnalyzedAt: lastAnalyzedAt?.toISOString() ?? null, confidenceRefreshed });
    }

    // New, or tracked with a stale crawl: select its pages, crawl, analyze.
    const outcome: DiscoveryOutcome = resolved.decision === "create" ? "new" : "refreshed";
    const search2 = await evidence(competitor.domain);
    await phase("pages", 0, 1);
    try {
      const crawl = await crawlAndStoreCompetitor({
        competitor,
        search: search2,
        context,
        policy,
        onSelection: async (selection) => {
          await phase("pages", 1, 1);
          await phase("crawl", 0, selection.length);
        },
        onPage: (done, total) => phase("crawl", done, total),
      });
      await phase("analyze", 0, 1);
      await phase("confidence", 0, 1);
      const analyzed = await analyzeCompetitor({ competitorId: competitor.id, search: search2, context, blockedByRobots: crawl.blockedByRobots });
      await phase("opportunities", 1, 1);
      console.log(`Discovery ${projectId}: ${competitor.domain} ${outcome}, ${crawl.pages} pages, confidence ${analyzed.confidence.confidence ?? "not scored"}`);
      return await finish({ ...facts, outcome, lastAnalyzedAt: new Date().toISOString(), confidenceRefreshed: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The competitor could not be analyzed.";
      await prisma.competitor.update({ where: { id: competitor.id }, data: { status: "failed", statusError: message } });
      return await fail(`${competitor.domain} was found, but its pages could not be analyzed: ${message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Competitor discovery failed.";
    console.error(`Discovery ${projectId} failed:`, error);
    outcomes.push({ status: "failed", reason: message.slice(0, 200) });
    return await fail(message);
  }
}
