import { NextResponse } from "next/server";
import { prisma, writePerfProgress } from "@seo-maker/db";
import { resolvePerfTargets } from "@/lib/perf-scope";
import { getAccountForUser } from "@/lib/plan";
import { PERF_ACTIVE } from "@/lib/performance";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueuePerformanceAudit, performanceJobActive, removeQueuedPerformance } from "@/lib/queue";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run PageSpeed." }, { status: 401 });
  }

  const { id } = await params;
  const [project, account] = await Promise.all([
    getProjectForUser(id, userId),
    getAccountForUser(userId),
  ]);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Enforced here and not only by the locked screen: a hidden button is not
  // an access control.
  if (!account.limits.performance) {
    return NextResponse.json(
      { error: `${account.limits.label} does not include PageSpeed runs. Upgrade to measure performance.`, upgrade: true },
      { status: 402 },
    );
  }

  if (PERF_ACTIVE.has(project.perfStatus)) {
    return NextResponse.json(
      {
        error:
          project.perfStatus === "cancelling"
            ? "The last PageSpeed run is still stopping. Try again in a few seconds."
            : "A PageSpeed run is already in progress.",
      },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => null)) as { pageIds?: unknown } | null;
  const requestedIds = Array.isArray(body?.pageIds)
    ? body.pageIds.filter((value): value is string => typeof value === "string")
    : undefined;

  const maxPages = Math.max(project.maxPages, account.limits.maxPages);
  const resolved = resolvePerfTargets({
    plan: account.plan,
    maxPages,
    pages: project.pages,
    rootUrl: project.rootUrl,
    requestedIds,
  });

  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const { targets } = resolved;

  await prisma.project.update({
    where: { id: project.id },
    data: {
      perfStatus: "queued",
      perfError: null,
    },
  });
  await writePerfProgress(prisma, project.id, {
    done: 0,
    total: targets.length,
    pageIds: targets.map((target) => target.pageId),
  });

  try {
    await enqueuePerformanceAudit({
      projectId: project.id,
      pages: targets,
    });
  } catch (error) {
    console.error("Failed to enqueue performance run", error);
    await prisma.project.update({
      where: { id: project.id },
      data: { perfStatus: "failed", perfError: "Queue is not running." },
    });
    return NextResponse.json(
      { error: "Queue is not running. Start Redis and the worker." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, total: targets.length });
}

/**
 * Stops the project's PageSpeed run.
 *
 * Queued: the job comes off the queue. Running: the project is marked
 * "cancelling"; the worker polls for it, cancels the Lighthouse call in flight
 * and keeps every page it already measured.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to stop PageSpeed." }, { status: 401 });
  }
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId }, select: { id: true, perfStatus: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (project.perfStatus === "queued") {
    let removed = 0;
    try {
      removed = await removeQueuedPerformance(project.id);
    } catch {
      return NextResponse.json({ error: "Queue is not running. Start Redis and the worker." }, { status: 503 });
    }
    if (removed > 0) {
      await prisma.project.updateMany({
        where: { id: project.id, perfStatus: "queued" },
        data: { perfStatus: "cancelled" },
      });
      return NextResponse.json({ ok: true, state: "stopped" });
    }
    // Not waiting any more: the worker has it, or the job was lost (Redis
    // restarted). A lost job has no worker to acknowledge a stop.
    if (!(await performanceJobActive(project.id).catch(() => true))) {
      await prisma.project.update({ where: { id: project.id }, data: { perfStatus: "cancelled" } });
      return NextResponse.json({ ok: true, state: "stopped" });
    }
  }

  const { count } = await prisma.project.updateMany({
    where: { id: project.id, perfStatus: { in: ["queued", "running", "cancelling"] } },
    data: { perfStatus: "cancelling" },
  });
  if (count === 0) {
    return NextResponse.json({ error: "No PageSpeed run is in progress." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, state: "stopping" });
}
