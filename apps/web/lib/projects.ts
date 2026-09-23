import { auth } from "@clerk/nextjs/server";
import { type Page, Prisma, prisma } from "@seo-maker/db";
import { keyOfPage } from "@/lib/page-results";

export async function requireUserId() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }
  return userId;
}

export async function getPageForUser(projectId: string, pageId: string, userId: string) {
  return prisma.page.findFirst({
    where: { id: pageId, projectId, project: { userId } },
    include: { project: true, issues: { orderBy: { severity: "asc" } } },
  });
}

/**
 * Pages belonging to the crawl the dashboard should show.
 *
 * Projects now keep several crawls for history, so a plain `project.pages`
 * would mix runs together. Everything the UI renders goes through here, which
 * keeps "the current state of the site" in one place.
 */
export async function latestPages(project: {
  id: string;
  latestCrawlId: string | null;
}): Promise<Page[]> {
  return prisma.page.findMany({
    where: project.latestCrawlId
      ? { crawlId: project.latestCrawlId }
      : { projectId: project.id, crawlId: null },
    orderBy: { createdAt: "asc" },
  });
}

export async function getProjectForUser(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) {
    return null;
  }
  return { ...project, pages: await latestPages(project) };
}

/**
 * The finished crawls for a project, newest first, for history and comparison.
 * `currentId` also brings in the crawl on screen when the user stopped it part
 * way (a first crawl's partial results), which is otherwise left out.
 */
export async function getCrawlHistory(projectId: string, take = 10, currentId?: string | null) {
  return prisma.crawl.findMany({
    where: {
      projectId,
      OR: [{ status: { in: ["completed", "failed"] } }, ...(currentId ? [{ id: currentId }] : [])],
    },
    orderBy: { startedAt: "desc" },
    take,
  });
}

/** Crawl runs across every project the user owns, newest first, for the workspace history. */
export async function getRecentCrawlsForUser(userId: string, take = 12) {
  return prisma.crawl.findMany({
    where: { project: { userId } },
    orderBy: { startedAt: "desc" },
    take,
    include: { project: { select: { id: true, name: true, rootUrl: true } } },
  });
}

/**
 * Projects for the dashboard list, each with only its latest crawl's pages.
 *
 * Two queries rather than a nested include: the pages to show depend on
 * `latestCrawlId`, which is a column on the parent row.
 */
export async function listProjectsForUser(userId: string) {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const crawlIds = projects
    .map((project) => project.latestCrawlId)
    .filter((id): id is string => Boolean(id));

  const pages = await prisma.page.findMany({
    where:
      crawlIds.length > 0
        ? { OR: [{ crawlId: { in: crawlIds } }, { projectId: { in: projects.map((p) => p.id) }, crawlId: null }] }
        : { projectId: { in: projects.map((project) => project.id) }, crawlId: null },
    orderBy: { createdAt: "asc" },
  });

  const byProject = new Map<string, typeof pages>();
  for (const page of pages) {
    // A project that has crawled must not also show its stale seed row.
    const project = projects.find((entry) => entry.id === page.projectId);
    if (!project) {
      continue;
    }
    if (project.latestCrawlId && page.crawlId !== project.latestCrawlId) {
      continue;
    }
    const bucket = byProject.get(page.projectId);
    if (bucket) {
      bucket.push(page);
    } else {
      byProject.set(page.projectId, [page]);
    }
  }

  // The list shows each site's homepage score (its first page). One DISTINCT
  // ON query for the newest run per homepage and device, by page key so a
  // re-crawl keeps it, instead of every run of every page.
  const homes = projects.flatMap((project) => {
    const first = byProject.get(project.id)?.[0];
    return first ? [{ projectId: project.id, pageKey: keyOfPage(first) }] : [];
  });
  const runs =
    homes.length > 0
      ? await prisma.$queryRaw<Array<{ projectId: string; strategy: string; performance: number | null }>>`
          SELECT DISTINCT ON ("projectId", "pageKey", "strategy") "projectId", "strategy", "performance"
          FROM "PerformanceAudit"
          WHERE ("projectId", "pageKey") IN (${Prisma.join(homes.map((home) => Prisma.sql`(${home.projectId}, ${home.pageKey})`))})
          ORDER BY "projectId", "pageKey", "strategy", "createdAt" DESC`
      : [];

  return projects.map((project) => ({
    ...project,
    pages: (byProject.get(project.id) ?? []).map((page, index) => ({
      ...page,
      performance: index === 0 ? runs.filter((run) => run.projectId === project.id) : [],
    })),
  }));
}

/** Latest-crawl pages for a project id, for callers that hold no project row. */
export async function latestPagesForProject(projectId: string): Promise<Page[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, latestCrawlId: true },
  });
  if (!project) {
    return [];
  }
  return latestPages(project);
}
