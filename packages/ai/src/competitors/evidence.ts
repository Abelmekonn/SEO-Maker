/**
 * Search evidence from stored and freshly fetched search results.
 *
 *   the project's active searches (CompetitorQuery, for its market)
 *     -> results fetched through the configured provider, unless checked
 *        within the SERP TTL (SerpResult rows, replaced per search)
 *     -> summarized per competitor (summarizeSearchEvidence)
 *
 * Manual competitors and automatic discovery read the same rows, so a
 * competitor added by hand is measured on exactly the searches discovery
 * uses. When there is no evidence, the reason is returned, never a zero.
 */

import {
  type CheckedQuery,
  type SearchEvidenceSummary,
  isFresh,
  resultMatchesDomain,
  summarizeSearchEvidence,
} from "@seo-maker/core/competitors";
import { SerpError, type SerpProvider, createSerpProvider } from "@seo-maker/core/serp";
import { type CompetitorQuery, prisma } from "@seo-maker/db";
import { type ProjectSearchContext, type SearchMarket, loadProjectSearchContext } from "./context";
import { activeSearchQueries, ensureKeywordQueries } from "./queries";

export type SerpRefresh = {
  fetched: number;
  reused: number;
  failed: number;
  /** Distinct provider errors, for the run's result. */
  errors: string[];
};

/**
 * Fetches results for each search not checked within `ttlHours`. A
 * credentials or balance failure stops the run: every later search would
 * fail the same way.
 */
export async function refreshSearchResults(input: {
  queries: CompetitorQuery[];
  provider: SerpProvider;
  selfDomain: string;
  ttlHours: number;
  depth: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => Promise<void>;
}): Promise<SerpRefresh> {
  const refresh: SerpRefresh = { fetched: 0, reused: 0, failed: 0, errors: [] };
  let done = 0;
  let stopped: string | null = null;
  for (const query of input.queries) {
    if (input.signal?.aborted) break;
    if (stopped) {
      refresh.failed += 1;
    } else if (query.status === "fetched" && isFresh(query.checkedAt, input.ttlHours)) {
      refresh.reused += 1;
    } else {
      try {
        const response = await input.provider.search({
          query: query.query,
          locationCode: query.locationCode,
          languageCode: query.languageCode,
          depth: input.depth,
          signal: input.signal,
        });
        const self = response.items.find((item) => resultMatchesDomain(item.domain, input.selfDomain) || resultMatchesDomain(hostOf(item.url), input.selfDomain));
        await prisma.$transaction([
          prisma.serpResult.deleteMany({ where: { queryId: query.id } }),
          prisma.serpResult.createMany({
            data: response.items.map((item) => ({
              queryId: query.id,
              position: item.position,
              domain: item.domain,
              url: item.url.slice(0, 2000),
              title: item.title?.slice(0, 500) ?? null,
              snippet: item.snippet?.slice(0, 1000) ?? null,
              resultType: item.resultType,
              provider: response.provider,
            })),
            skipDuplicates: true,
          }),
          prisma.competitorQuery.update({
            where: { id: query.id },
            data: { status: "fetched", checkedAt: new Date(), selfPosition: self?.position ?? null, selfUrl: self?.url ?? null },
          }),
        ]);
        refresh.fetched += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        refresh.failed += 1;
        if (!refresh.errors.includes(message)) refresh.errors.push(message);
        await prisma.competitorQuery.update({
          where: { id: query.id },
          data: { status: error instanceof SerpError && (error.kind === "auth" || error.kind === "quota") ? "unavailable" : "failed" },
        });
        if (error instanceof SerpError && (error.kind === "auth" || error.kind === "quota")) stopped = message;
      }
    }
    done += 1;
    await input.onProgress?.(done, input.queries.length);
  }
  return refresh;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Active searches for the market with their stored results. */
export async function loadCheckedQueries(projectId: string, market: Pick<SearchMarket, "locationCode" | "languageCode">): Promise<CheckedQuery[]> {
  const rows = await prisma.competitorQuery.findMany({
    where: { projectId, status: { not: "retired" }, locationCode: market.locationCode, languageCode: market.languageCode },
    include: { results: { where: { resultType: "organic" }, orderBy: { position: "asc" } } },
  });
  return rows.map((row) => ({
    id: row.id,
    query: row.query,
    intent: row.intent,
    relevance: row.relevance,
    checked: row.checkedAt != null && row.status !== "failed" && row.status !== "unavailable",
    selfPosition: row.selfPosition,
    results: row.results.map((result) => ({ position: result.position, domain: result.domain, url: result.url, title: result.title })),
  }));
}

export type CompetitorSearchEvidence = {
  /** Null when no search results could be checked. */
  summary: SearchEvidenceSummary | null;
  /** Why there is no search evidence. */
  unavailableReason: string | null;
  refresh: SerpRefresh | null;
  market: SearchMarket | null;
  /** Words of the searches, for choosing which competitor pages matter. */
  queryTerms: string[];
};

export const NO_PROVIDER_REASON =
  "No search results provider is configured, so shared searches and rankings cannot be checked. Search evidence appears once one is set up.";

/**
 * Search evidence for one competitor, shared by manual analysis and
 * discovery. With `refresh`, stale searches are fetched first; without it,
 * what is stored is used as it is.
 */
export async function getCompetitorSearchEvidence(input: {
  projectId: string;
  competitorDomain: string;
  refresh: boolean;
  ttlHours: number;
  depth: number;
  /** Omit to use the configured provider; null means none. */
  provider?: SerpProvider | null;
  context?: ProjectSearchContext | null;
  signal?: AbortSignal;
}): Promise<CompetitorSearchEvidence> {
  const context = input.context ?? (await loadProjectSearchContext(input.projectId));
  const empty = (reason: string, market: SearchMarket | null = null): CompetitorSearchEvidence => ({
    summary: null,
    unavailableReason: reason,
    refresh: null,
    market,
    queryTerms: [],
  });
  if (!context) return empty("Project not found.");
  const market = context.searchMarket;
  if (!market) {
    return empty(
      context.project.targetLocation
        ? "Your target location does not name a country, so there is no market to check searches in."
        : "Your target location is not set, so there is no market to check searches in.",
    );
  }

  let queries = await activeSearchQueries(context.project.id, market);
  if (queries.length === 0) queries = await ensureKeywordQueries(context);
  if (queries.length === 0) {
    return empty("No search queries yet. Generate search keywords for your site, then analyze this competitor again.", market);
  }

  const provider = input.provider === undefined ? createSerpProvider() : input.provider;
  let refresh: SerpRefresh | null = null;
  if (input.refresh && provider) {
    refresh = await refreshSearchResults({
      queries,
      provider,
      selfDomain: context.selfDomain,
      ttlHours: input.ttlHours,
      depth: input.depth,
      signal: input.signal,
    });
  }

  const checked = await loadCheckedQueries(context.project.id, market);
  const queryTerms = [...new Set(checked.flatMap((query) => query.query.split(/\s+/)))];
  if (!checked.some((query) => query.checked)) {
    return {
      summary: null,
      unavailableReason: !provider
        ? NO_PROVIDER_REASON
        : refresh?.errors.length
          ? `Search results could not be fetched: ${refresh.errors[0]}`
          : "No search results have been checked for your searches yet.",
      refresh,
      market,
      queryTerms,
    };
  }
  return {
    summary: summarizeSearchEvidence(checked, input.competitorDomain),
    unavailableReason: null,
    refresh,
    market,
    queryTerms,
  };
}
