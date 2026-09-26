import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getUserQuota } from "@/lib/ai-access";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { getAiQueueJobs, getAiStopAt } from "@/lib/queue";
import { pagePath } from "@/lib/site-url";

/**
 * Live Page AI progress for one project: which pages are running or waiting
 * and where they sit in the queue, plus the user's own AI allowance. The UI
 * polls this while work is queued, so results appear without a refresh.
 *
 * Deliberately nothing about tokens, budgets or cost: those are the owner's
 * concern and stay on the server.
 */

/** A rough per-page pace for the "about N minutes" hint. */
const MINUTES_PER_PAGE = 1;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view AI progress." }, { status: 401 });
  }
  const { id } = await params;
  const [project, account] = await Promise.all([getProjectForUser(id, userId), getAccountForUser(userId)]);
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

  const [quota, pages] = await Promise.all([
    getUserQuota(userId, account.limits),
    jobs.length
      ? prisma.page.findMany({
          where: { id: { in: jobs.map((job) => job.pageId) } },
          select: { id: true, url: true, finalUrl: true },
        })
      : [],
  ]);
  const paths = new Map(pages.map((page) => [page.id, pagePath(page.finalUrl ?? page.url)]));

  const deepest = jobs.reduce((max, job) => Math.max(max, job.position), 0);
  const etaMinutes = jobs.length
    ? Math.max(1, (deepest + (jobs.some((job) => job.state === "active") ? 1 : 0)) * MINUTES_PER_PAGE)
    : 0;

  return NextResponse.json({
    queueOnline,
    stopping,
    jobs: jobs.map((job) => ({
      jobId: job.jobId,
      pageId: job.pageId,
      state: job.state,
      position: job.position,
      features: job.features,
      path: paths.get(job.pageId) ?? null,
    })),
    etaMinutes,
    quota,
  });
}
