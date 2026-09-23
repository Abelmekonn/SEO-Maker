import { auth } from "@clerk/nextjs/server";
import { type Page, prisma } from "@seo-maker/db";

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

/** The finished crawls for a project, newest first, for history and comparison. */
export async function getCrawlHistory(projectId: string, take = 10) {
  return prisma.crawl.findMany({
    where: { projectId, status: { in: ["completed", "failed"] } },
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
    include: { performance: { orderBy: { createdAt: "desc" } } },
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

  return projects.map((project) => ({ ...project, pages: byProject.get(project.id) ?? [] }));
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
