import { COMPETITOR_ACTIVE, deriveCompetitorView } from "@seo-maker/core/competitors";
import { prisma } from "@seo-maker/db";

export { COMPETITOR_ACTIVE, deriveCompetitorView };

/** Project-level discovery states that mean a job is in flight. */
export const COMP_ACTIVE = new Set(["queued", "running"]);

/**
 * Whether a SERP provider is configured at all.
 *
 * Read from env rather than the persisted `compProviderOk` flag, because that
 * flag only records what was true during the last run — this has to be right
 * before the first run too.
 */
export function serpConfigured() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
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
