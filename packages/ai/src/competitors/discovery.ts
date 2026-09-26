/**
 * Automatic competitor discovery: finding the one strongest competitor.
 *
 *   business profile -> search queries (generateSearchQueries, cached)
 *     -> search results for each (refreshSearchResults, TTL-reused)
 *     -> every domain aggregated across the searches (aggregateCandidates)
 *     -> the strongest recurring one (selectStrongestCandidate)
 *     -> create it, or reuse the competitor already tracked (resolveDiscoveredCompetitor)
 *
 * Crawling is the worker's; this is the part that needs no crawler, so it
 * can be tested against a database with a stub search provider.
 */

import {
  type Candidate,
  type CandidateAggregation,
  type CompetitorPolicy,
  type DiscoveryDecision,
  type ProfileGap,
  aggregateCandidates,
  decideDiscoveryAction,
  selectStrongestCandidate,
} from "@seo-maker/core/competitors";
import type { CompetitorPhase } from "@seo-maker/core/queue";
import type { SerpProvider } from "@seo-maker/core/serp";
import { type Competitor, Prisma, prisma } from "@seo-maker/db";
import { type ProjectSearchContext, loadProjectSearchContext } from "./context";
import { type SerpRefresh, loadCheckedQueries, refreshSearchResults } from "./evidence";
import { type GenerateQueriesResult, activeSearchQueries, generateSearchQueries } from "./queries";

export type DiscoverySearch =
  | { status: "profile-required"; gaps: ProfileGap[] }
  | { status: "failed"; message: string }
  | {
      status: "ok";
      context: ProjectSearchContext;
      queriesSource: "generated" | "cached" | "existing";
      queryCount: number;
      refresh: SerpRefresh;
      aggregation: CandidateAggregation;
      strongest: Candidate | null;
    };

/**
 * Runs the search half of discovery and reports each phase it works through.
 * Existing queries are used when generation fails but a set is stored.
 */
export async function runDiscoverySearch(input: {
  projectId: string;
  provider: SerpProvider;
  policy: CompetitorPolicy;
  signal?: AbortSignal;
  /** Replaceable in tests; defaults to the real generator. */
  generate?: (projectId: string) => Promise<GenerateQueriesResult>;
  onPhase?: (phase: CompetitorPhase, done: number, total: number) => Promise<void>;
}): Promise<DiscoverySearch> {
  const phase = input.onPhase ?? (async () => {});
  await phase("profile", 0, 1);
  const context = await loadProjectSearchContext(input.projectId);
  if (!context) return { status: "failed", message: "Project not found." };
  if (context.gaps.length > 0 || !context.searchMarket) return { status: "profile-required", gaps: context.gaps };
  const market = context.searchMarket;
  await phase("profile", 1, 1);

  await phase("queries", 0, 1);
  const generated = await (input.generate ?? ((projectId) => generateSearchQueries({ projectId, signal: input.signal })))(input.projectId);
  let queriesSource: "generated" | "cached" | "existing";
  if (generated.status === "profile-required") return { status: "profile-required", gaps: generated.gaps };
  if (generated.status === "ok") {
    queriesSource = generated.cached ? "cached" : "generated";
  } else {
    queriesSource = "existing";
  }
  const queries = await activeSearchQueries(input.projectId, market);
  if (queries.length === 0) {
    return {
      status: "failed",
      message: generated.status === "failed" ? `Search queries could not be generated: ${generated.message}` : "No search queries to check.",
    };
  }
  await phase("queries", 1, 1);

  await phase("serp", 0, queries.length);
  const refresh = await refreshSearchResults({
    queries,
    provider: input.provider,
    selfDomain: context.selfDomain,
    ttlHours: input.policy.serpTtlHours,
    depth: input.policy.serpDepth,
    signal: input.signal,
    onProgress: (done, total) => phase("serp", done, total),
  });

  await phase("candidates", 0, 1);
  const checked = (await loadCheckedQueries(input.projectId, market)).filter((query) => query.checked);
  if (checked.length === 0) {
    return {
      status: "failed",
      message: refresh.errors.length ? `Search results could not be fetched: ${refresh.errors[0]}` : "No search results could be checked.",
    };
  }
  const removed = await prisma.competitor.findMany({ where: { projectId: input.projectId, excluded: true }, select: { domain: true } });
  const aggregation = aggregateCandidates({
    queries: checked.map((query) => ({ id: query.id, query: query.query, relevance: query.relevance })),
    results: checked.flatMap((query) => query.results.map((result) => ({ queryId: query.id, position: result.position, domain: result.domain, url: result.url }))),
    selfDomain: context.selfDomain,
    excludedDomains: removed.map((row) => row.domain),
  });
  await phase("candidates", 1, 1);

  await phase("select", 0, 1);
  const strongest = selectStrongestCandidate(aggregation);
  await phase("select", 1, 1);

  return { status: "ok", context, queriesSource, queryCount: queries.length, refresh, aggregation, strongest };
}

export type ResolvedCompetitor = { decision: DiscoveryDecision; competitor: Competitor | null };

/**
 * Finds or creates the discovered competitor, keyed by the (projectId,
 * domain) unique constraint, so running discovery twice can never create a
 * second row. A tracked competitor with a fresh crawl is left untouched.
 */
export async function resolveDiscoveredCompetitor(input: {
  projectId: string;
  candidate: Candidate;
  maxCompetitors: number;
  policy: CompetitorPolicy;
  now?: Date;
}): Promise<ResolvedCompetitor> {
  const domain = input.candidate.domain;
  const existing = await prisma.competitor.findUnique({ where: { projectId_domain: { projectId: input.projectId, domain } } });
  const trackedCount = await prisma.competitor.count({ where: { projectId: input.projectId, excluded: false } });
  const decision = decideDiscoveryAction({
    existing,
    trackedCount,
    maxCompetitors: input.maxCompetitors,
    crawlTtlHours: input.policy.crawlTtlHours,
    now: input.now,
  });

  const discovery = {
    discoveredAt: (input.now ?? new Date()).toISOString(),
    appearances: input.candidate.appearances,
    queriesChecked: input.candidate.queriesChecked,
    top10: input.candidate.top10,
    bestPosition: input.candidate.bestPosition,
    strength: input.candidate.strength,
  };
  const withDiscovery = (metadata: unknown) =>
    ({ ...((metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>), discovery }) as Prisma.InputJsonValue;

  if (decision === "create") {
    const competitor = await prisma.competitor.upsert({
      where: { projectId_domain: { projectId: input.projectId, domain } },
      create: { projectId: input.projectId, domain, source: "serp", status: "queued", metadata: withDiscovery(null) },
      update: {},
    });
    return { decision, competitor };
  }
  if (decision === "refresh") {
    const competitor = await prisma.competitor.update({
      where: { id: existing!.id },
      data: { status: "queued", statusError: null, crawlDone: 0, crawlTotal: 0, metadata: withDiscovery(existing!.metadata) },
    });
    return { decision, competitor };
  }
  if (decision === "reuse") {
    const competitor = await prisma.competitor.update({ where: { id: existing!.id }, data: { metadata: withDiscovery(existing!.metadata) } });
    return { decision, competitor };
  }
  return { decision, competitor: existing };
}
