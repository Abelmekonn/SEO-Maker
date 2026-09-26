import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { requireUserId } from "@/lib/projects";
import { PERF_ACTIVE } from "@/lib/performance";
import { getAiCompetitorJobs, getAiQueueJobs, getAiSiteJobs } from "@/lib/queue";

/** Competitor row states with work still to do: the same set the Competitors screen polls on. */
const COMPETITOR_ROW_ACTIVE = ["queued", "crawling", "analyzing"];

/**
 * Competitor work in progress: a discovery run, or competitors being crawled
 * and scored. Progress is the discovery's when one runs, otherwise the pages
 * crawled across the competitors in flight.
 */
function competitorActivity(
  project: { compStatus: string; compDone: number; compTotal: number },
  rivals: Array<{ crawlDone: number; crawlTotal: number }>,
): { running: boolean; done: number; total: number } {
  if (project.compStatus === "queued" || project.compStatus === "running") {
    return { running: true, done: project.compDone, total: project.compTotal };
  }
  return {
    running: rivals.length > 0,
    done: rivals.reduce((sum, row) => sum + row.crawlDone, 0),
    total: rivals.reduce((sum, row) => sum + row.crawlTotal, 0),
  };
}

/**
 * What is running for a project right now, for the sidebar's mini progress
 * indicators: crawl, PageSpeed, competitor discovery and AI. One small query
 * per area, so the sidebar can poll it cheaply while anything is in flight.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in." }, { status: 401 });
  }
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      perfStatus: true,
      perfDone: true,
      perfTotal: true,
      compStatus: true,
      compDone: true,
      compTotal: true,
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const [crawl, rivals, aiJobs, siteJobs, competitorJobs] = await Promise.all([
    prisma.crawl.findFirst({
      where: { projectId: id, status: { in: ["crawling", "analyzing", "cancelling"] } },
      orderBy: { startedAt: "desc" },
      select: { id: true, maxPages: true },
    }),
    // A competitor added or re-analysed is crawled on its own row; discovery
    // is not involved, so the project's compStatus never moves for it.
    prisma.competitor.findMany({
      where: { projectId: id, excluded: false, status: { in: COMPETITOR_ROW_ACTIVE } },
      select: { crawlDone: true, crawlTotal: true },
    }),
    getAiQueueJobs(id).catch(() => []),
    getAiSiteJobs(id).catch(() => []),
    getAiCompetitorJobs(id).catch(() => []),
  ]);
  const crawled = crawl
    ? await prisma.page.count({ where: { crawlId: crawl.id, status: { in: ["analyzed", "excluded", "failed"] } } })
    : 0;

  return NextResponse.json({
    crawl: {
      running: Boolean(crawl) || project.status === "pending",
      done: crawled,
      // The page limit: the crawler follows links, so it is the honest ceiling.
      total: crawl ? crawl.maxPages : 0,
    },
    performance: {
      running: PERF_ACTIVE.has(project.perfStatus),
      done: project.perfDone,
      total: project.perfTotal,
    },
    competitors: competitorActivity(project, rivals),
    ai: { running: aiJobs.length > 0, jobs: aiJobs.length },
    // Site-level and competitor AI (Phase 3.3, 4.1), shown on their own pages.
    opportunities: { running: siteJobs.length > 0 },
    competitorAi: { running: competitorJobs.length > 0 },
  });
}
