import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { requireUserId } from "@/lib/projects";
import { PERF_ACTIVE } from "@/lib/performance";
import { getAiQueueJobs } from "@/lib/queue";

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
    select: { id: true, status: true, perfStatus: true, perfDone: true, perfTotal: true, compStatus: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const [crawl, aiJobs] = await Promise.all([
    prisma.crawl.findFirst({
      where: { projectId: id, status: { in: ["crawling", "analyzing", "cancelling"] } },
      orderBy: { startedAt: "desc" },
      select: { id: true, maxPages: true },
    }),
    getAiQueueJobs(id).catch(() => []),
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
    competitors: { running: project.compStatus === "queued" || project.compStatus === "running" },
    ai: { running: aiJobs.length > 0, jobs: aiJobs.length },
  });
}
