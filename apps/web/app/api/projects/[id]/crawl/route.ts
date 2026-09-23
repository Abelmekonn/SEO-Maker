import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getCrawlProgress } from "@/lib/crawl-progress";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueHomepageCrawl } from "@/lib/queue";
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
