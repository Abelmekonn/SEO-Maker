import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getCrawlProgress } from "@/lib/crawl-progress";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueHomepageCrawl, removeQueuedCrawl } from "@/lib/queue";
import { findHomepage } from "@/lib/site-url";

/**
 * Queues a re-crawl.
 *
 * This used to null out every column on every page and set them back to
 * pending, so the moment a user pressed "Crawl again" the previous results
 * were gone — and if the new crawl failed there was nothing to fall back to.
 * The worker now writes into a fresh `Crawl`, and the project only points at
 * it once that run completes, so the last good crawl stays readable
 * throughout.
 */

/** Live progress of the running (or last) crawl, polled by the progress view. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view crawl progress." }, { status: 401 });
  }
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json(await getCrawlProgress(project));
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run a crawl." }, { status: 401 });
  }

  const { id } = await params;
  const [project, account] = await Promise.all([
    getProjectForUser(id, userId),
    getAccountForUser(userId),
  ]);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // One crawl at a time per site. A second press while one runs would queue
  // a duplicate crawl behind it.
  const inFlight = await activeCrawl(project.id);
  if (inFlight || project.status === "pending") {
    return NextResponse.json({ error: "A crawl is already running for this site." }, { status: 409 });
  }

  const seed = findHomepage(project.pages, project.rootUrl);
  const startUrl = seed?.url ?? project.rootUrl;
  const maxPages = Math.max(project.maxPages, account.limits.maxPages);

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "pending", maxPages },
  });

  try {
    await enqueueHomepageCrawl({
      projectId: project.id,
      pageId: seed?.id ?? project.id,
      url: startUrl,
    });
  } catch (error) {
    console.error("Failed to enqueue crawl", error);
    await prisma.project.update({
      where: { id: project.id },
      data: { status: project.latestCrawlId ? "analyzed" : "pending" },
    });
    return NextResponse.json(
      { error: "Queue is not running. Start Redis and the worker." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, maxPages });
}

/** Crawl rows the worker is still working on. */
const ACTIVE_CRAWL = ["pending", "crawling", "analyzing", "cancelling"];

function activeCrawl(projectId: string) {
  return prisma.crawl.findFirst({
    where: { projectId, status: { in: ACTIVE_CRAWL } },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true },
  });
}

/**
 * Stops the project's crawl.
 *
 * Queued: the job comes off the queue and never runs. Running: the crawl row
 * is marked "cancelling" and the worker, which polls it, stops fetching within
 * a couple of seconds and records the outcome (see stopCrawl in the worker).
 * Scoring: too late to stop; it finishes in a moment anyway.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to stop a crawl." }, { status: 401 });
  }
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true, status: true, maxPages: true, latestCrawlId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const markStopping = async () => {
    const crawl = await activeCrawl(project.id);
    if (!crawl) return null;
    if (crawl.status === "analyzing") return "finishing" as const;
    const { count } = await prisma.crawl.updateMany({
      where: { id: crawl.id, status: { in: ["pending", "crawling", "cancelling"] } },
      data: { status: "cancelling" },
    });
    return count > 0 ? ("stopping" as const) : "finishing";
  };

  const running = await markStopping();
  if (running === "stopping") {
    return NextResponse.json({ ok: true, state: "stopping" });
  }
  if (running === "finishing") {
    return NextResponse.json(
      { error: "The crawl is already scoring its pages and finishes in a moment." },
      { status: 409 },
    );
  }

  let removed = 0;
  try {
    removed = await removeQueuedCrawl(project.id);
  } catch {
    return NextResponse.json({ error: "Queue is not running. Start Redis and the worker." }, { status: 503 });
  }

  if (removed === 0) {
    // The worker may have taken the job a moment ago and not yet written its
    // crawl row. Give it a beat, then stop that crawl instead.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const late = await markStopping();
    if (late === "stopping") {
      return NextResponse.json({ ok: true, state: "stopping" });
    }
    if (late === "finishing") {
      return NextResponse.json({ error: "The crawl finishes in a moment." }, { status: 409 });
    }
    if (project.status !== "pending") {
      return NextResponse.json({ error: "No crawl is running for this site." }, { status: 409 });
    }
  }

  // Stopped before it began. The row records that it was asked for and
  // stopped, so the overview can say so instead of showing nothing.
  await prisma.crawl.create({
    data: {
      projectId: project.id,
      status: "cancelled",
      phase: "cancelled",
      maxPages: project.maxPages,
      finishedAt: new Date(),
    },
  });
  await prisma.project.update({
    where: { id: project.id },
    data: { status: project.latestCrawlId ? "analyzed" : "cancelled" },
  });
  return NextResponse.json({ ok: true, state: "stopped" });
}
