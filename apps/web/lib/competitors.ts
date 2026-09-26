import { activeSearchQueries, loadProjectSearchContext } from "@seo-maker/ai";
import { COMPETITOR_ACTIVE, type ProfileGap, deriveCompetitorView, googleSearchUrl } from "@seo-maker/core/competitors";
import { serpProviderConfigured } from "@seo-maker/core/serp";
import { prisma } from "@seo-maker/db";

export { COMPETITOR_ACTIVE, deriveCompetitorView };

/** Project-level discovery states that mean a job is in flight. */
export const COMP_ACTIVE = new Set(["queued", "running"]);

/**
 * Whether a SERP provider is configured at all.
 *
 * Read from env rather than the persisted `compProviderOk` flag, because that
 * flag only records what was true during the last run — this has to be right
 * before the first run too. Credentials never leave the server.
 */
export function serpConfigured() {
  return serpProviderConfigured();
}

export async function getCompetitorsForProject(projectId: string) {
  return prisma.competitor.findMany({
    where: { projectId, excluded: false },
    orderBy: [{ pinned: "desc" }, { confidence: "desc" }, { createdAt: "asc" }],
  });
}

export async function getExcludedCompetitorCount(projectId: string) {
  return prisma.competitor.count({ where: { projectId, excluded: true } });
}

export async function getCompetitorForUser(
  projectId: string,
  competitorId: string,
  userId: string,
) {
  return prisma.competitor.findFirst({
    where: { id: competitorId, projectId, project: { userId } },
    include: {
      project: true,
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function getCompetitorInsights(projectId: string) {
  const [gaps, opportunities] = await Promise.all([
    prisma.contentGap.findMany({
      where: { projectId, status: { not: "dismissed" } },
      orderBy: { competitorCount: "desc" },
      take: 50,
    }),
    prisma.opportunity.findMany({
      where: { projectId, source: "competitor", status: { not: "dismissed" } },
      orderBy: { score: "desc" },
      take: 50,
    }),
  ]);
  return { gaps, opportunities };
}

/** One of the project's search keywords, as the keyword list shows it. */
export type SearchKeyword = {
  id: string;
  query: string;
  intent: string;
  priority: string | null;
  reason: string | null;
  source: string;
  /** Opens this exact search on Google, in the user's own browser. */
  googleUrl: string;
  checkedAt: string | null;
  /** Where your site appeared in the checked results, when it did. */
  selfPosition: number | null;
};

export type SearchKeywordState = {
  keywords: SearchKeyword[];
  /** What the business profile still lacks before keywords can be generated. */
  gaps: ProfileGap[];
  market: { country: string; languageCode: string } | null;
};

/** The project's active search keywords for its market. */
export async function getSearchKeywords(projectId: string): Promise<SearchKeywordState> {
  const context = await loadProjectSearchContext(projectId);
  if (!context) return { keywords: [], gaps: [], market: null };
  const market = context.searchMarket;
  const rows = market ? await activeSearchQueries(projectId, market) : [];
  return {
    gaps: context.gaps,
    market: market ? { country: market.country.name, languageCode: market.languageCode } : null,
    keywords: rows.map((row) => ({
      id: row.id,
      query: row.query,
      intent: row.intent,
      priority: row.priority,
      reason: row.reason,
      source: row.source,
      googleUrl: googleSearchUrl(row.query),
      checkedAt: row.checkedAt?.toISOString() ?? null,
      selfPosition: row.selfPosition,
    })),
  };
}

/** Searches that count as evidence: the active set, not retired history. */
export function activeQueryCount(projectId: string) {
  return prisma.competitorQuery.count({ where: { projectId, status: { not: "retired" }, checkedAt: { not: null } } });
}
