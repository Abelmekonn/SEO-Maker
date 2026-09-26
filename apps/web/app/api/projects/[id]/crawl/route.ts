import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { refundUsage, reserveSiteCrawl } from "@/lib/crawl-access";
import { getCrawlProgress } from "@/lib/crawl-progress";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";
import { enqueueHomepageCrawl, removeQueuedCrawl } from "@/lib/queue";
import { loadInventory } from "@/lib/site-inventory";
import { siteKeyOf } from "@/lib/site-url";

/**
 * Queues a crawl of pages the site's page inventory already holds.
 *
 * Body: { pages?: string[], scope?: "recrawl" | "new-pages" }
 *
 *   no pages   the inventory's Priority pages. A new site's first crawl is
 *              this: "Start crawl — Priority pages".
 *   pages      page keys chosen on the re-crawl screen, or the pages a check
 *              for new pages just found (scope "new-pages").
 *
 * Pages are fetched at the tier they are classified at; nothing is
 * discovered or re-classified here. Pages not chosen keep their last results.
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run a crawl." }, { status: 401 });
  }

  const { id } = await params;
  const [project, account] = await Promise.all([
    prisma.project.findFirst({ where: { id, userId } }),
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
  if (project.discoveryStatus === "queued" || project.discoveryStatus === "running") {
    return NextResponse.json(
      { error: "This site's pages are being discovered. Crawl them when discovery finishes." },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { pages?: unknown; scope?: unknown };
  if (body.pages !== undefined && (!Array.isArray(body.pages) || !body.pages.every((key) => typeof key === "string"))) {
    return NextResponse.json({ error: "Send `pages` as a list of page keys." }, { status: 400 });
  }
  const chosen = Array.isArray(body.pages) ? [...new Set(body.pages as string[])] : null;
  if (chosen && chosen.length === 0) {
    return NextResponse.json({ error: "Choose at least one page to crawl." }, { status: 400 });
  }

  // Only pages the inventory holds can be crawled: this is not a way to fetch
  // arbitrary URLs. The plan caps how many one crawl fetches.
  const inventory = await loadInventory(project, account.limits);
  const known = new Set(inventory.map((row) => row.pageKey));
  if (chosen) {
    const unknown = chosen.filter((key) => !known.has(key));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Not a page of this site's inventory: ${unknown.slice(0, 3).join(", ")}` },
        { status: 400 },
      );
    }
    if (chosen.length > account.limits.maxPages) {
      return NextResponse.json(
        {
          error: `${account.limits.label} crawls up to ${account.limits.maxPages} ${account.limits.maxPages === 1 ? "page" : "pages"} at a time. Choose fewer pages.`,
          upgrade: account.plan === "free",
        },
        { status: 400 },
      );
    }
  } else if (inventory.length > 0 && !inventory.some((row) => row.tier === "priority")) {
    return NextResponse.json({ error: "No page is Priority. Make a page Priority, or choose pages to crawl." }, { status: 400 });
  }

  // Always from the site's root: robots.txt and the sitemaps are read there.
  const startUrl = project.rootUrl;
  const maxPages = account.limits.maxPages;

  // A first crawl that never ran is not a re-crawl.
  const scope = project.latestCrawlId ? "recrawl" : "initial";
  const reservation = await reserveSiteCrawl({
    userId,
    account,
    siteKey: project.siteKey ?? siteKeyOf(project.rootUrl),
    projectId: project.id,
    scope,
  });
  if (!reservation.ok) return reservation.response;

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "pending", maxPages },
  });

  try {
    await enqueueHomepageCrawl({
      projectId: project.id,
      url: startUrl,
      targets: chosen ?? undefined,
      scope: scope === "initial" ? "initial" : body.scope === "new-pages" ? "new-pages" : "recrawl",
      usageId: reservation.usageId,
    });
  } catch (error) {
    console.error("Failed to enqueue crawl", error);
    await refundUsage([reservation.usageId], "could not queue");
    await prisma.project.update({
      where: { id: project.id },
      data: { status: project.status },
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
    const result = await removeQueuedCrawl(project.id);
    removed = result.removed;
    // Stopped before it began: never charged.
    await refundUsage(result.usageIds, "stopped before it started", "cancelled");
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
    // A first crawl stopped before it began: the site is ready to crawl again.
    data: { status: project.latestCrawlId ? "analyzed" : "discovered" },
  });
  return NextResponse.json({ ok: true, state: "stopped" });
}
