import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";
import { enqueueDiscovery, getCrawlQueueState } from "@/lib/queue";
import { discoveryState, loadInventory } from "@/lib/site-inventory";

/**
 * Page discovery: finding the site's pages and classifying them, without
 * crawling them.
 *
 * GET is its progress and last result, polled while it runs. POST starts one:
 *
 *   { mode: "new-pages" }  "Check for new pages": pages not known yet are
 *                          classified and added; known pages keep their
 *                          classification, and nothing is crawled.
 *   { mode: "initial" }    a new site's first discovery, again, after it failed.
 */

const ACTIVE = ["queued", "running"];
const ACTIVE_CRAWL = ["pending", "crawling", "analyzing", "cancelling"];

async function load(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId },
    select: {
      id: true,
      rootUrl: true,
      status: true,
      latestCrawlId: true,
      pagePriorityOverrides: true,
      discoveryStatus: true,
      discoveryMode: true,
      discoveryError: true,
      discoveryAt: true,
      discoveryResult: true,
    },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view page discovery." }, { status: 401 });
  }
  const { id } = await params;
  const project = await load(id, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const queue = await getCrawlQueueState(project.id).catch(() => ({ workerOnline: false, waitingPosition: null }));
  return NextResponse.json({ ...discoveryState(project), workerOnline: queue.workerOnline });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to discover pages." }, { status: 401 });
  }
  const { id } = await params;
  const [project, account] = await Promise.all([load(id, userId), getAccountForUser(userId)]);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
  const mode = body.mode === "initial" ? "initial" : body.mode === "new-pages" ? "new-pages" : null;
  if (!mode) {
    return NextResponse.json({ error: 'Send `mode`: "new-pages", or "initial" to retry a first discovery.' }, { status: 400 });
  }
  if (mode === "initial" && project.latestCrawlId) {
    return NextResponse.json(
      { error: "This site has been crawled. Use Check for New Pages to find pages added since." },
      { status: 409 },
    );
  }
  if (mode === "new-pages" && !project.latestCrawlId && project.status !== "discovered") {
    return NextResponse.json({ error: "Discover and crawl this site first." }, { status: 409 });
  }

  const crawling = await prisma.crawl.findFirst({
    where: { projectId: project.id, status: { in: ACTIVE_CRAWL } },
    select: { id: true },
  });
  if (crawling || project.status === "pending") {
    return NextResponse.json({ error: "A crawl is running for this site. Check for new pages when it finishes." }, { status: 409 });
  }

  // The known pages must exist before new ones are told apart from them. A
  // site crawled before the inventory existed has it built now.
  if (mode === "new-pages") {
    await loadInventory(project, account.limits);
  }

  // One discovery at a time: claim the project, or report the one running.
  const { count } = await prisma.project.updateMany({
    where: { id: project.id, discoveryStatus: { notIn: ACTIVE } },
    data: {
      discoveryStatus: "queued",
      discoveryMode: mode,
      discoveryError: null,
      ...(mode === "initial" ? { status: "discovering" } : {}),
    },
  });
  if (count === 0) {
    return NextResponse.json({ ok: true, queued: false, message: "Already looking for pages. Progress is shown here." });
  }

  try {
    await enqueueDiscovery({ projectId: project.id, mode });
  } catch (error) {
    console.error("Failed to enqueue discovery", error);
    await prisma.project.update({
      where: { id: project.id },
      data: {
        discoveryStatus: "failed",
        discoveryError: "The crawler queue is offline. Try again shortly.",
        ...(mode === "initial" ? { status: "failed" } : {}),
      },
    });
    return NextResponse.json({ error: "The crawler queue is offline. Start Redis and the worker." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, queued: true });
}
