import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getAiUsage } from "@/lib/ai-usage";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { getAiQueueJobs, getAiStopAt } from "@/lib/queue";
import { pagePath } from "@/lib/site-url";

/**
 * Live AI progress for one project: which pages are running or waiting, where
 * they sit in the shared queue, and how much of today's token budget is left.
 * The UI polls this while work is queued, so results appear without a manual
 * refresh and the wait is stated rather than guessed at.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view AI progress." }, { status: 401 });
  }
  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let jobs: Awaited<ReturnType<typeof getAiQueueJobs>> = [];
  let stopAt: number | null = null;
  let queueOnline = true;
  try {
    [jobs, stopAt] = await Promise.all([getAiQueueJobs(project.id), getAiStopAt(project.id)]);
  } catch {
    queueOnline = false;
  }
  // Work queued before the last Stop is on its way out, not still to come.
  const stopping = stopAt != null && jobs.some((job) => job.queuedAt <= stopAt);

  const [usage, pages] = await Promise.all([
    getAiUsage(),
    jobs.length
      ? prisma.page.findMany({
          where: { id: { in: jobs.map((job) => job.pageId) } },
          select: { id: true, url: true, finalUrl: true },
        })
      : [],
  ]);
  const paths = new Map(pages.map((page) => [page.id, pagePath(page.finalUrl ?? page.url)]));

  // Jobs ahead of this project's last one, including other projects' work,
  // times the per-page pace of the current tier.
  const deepest = jobs.reduce((max, job) => Math.max(max, job.position), 0);
  const etaMinutes = jobs.length ? Math.max(1, (deepest + (jobs.some((job) => job.state === "active") ? 1 : 0)) * usage.minutesPerPage) : 0;

  return NextResponse.json({
    queueOnline,
    stopping,
    jobs: jobs.map((job) => ({ ...job, path: paths.get(job.pageId) ?? null })),
    etaMinutes,
    usage,
  });
}
