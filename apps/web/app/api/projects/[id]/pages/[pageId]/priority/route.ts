import { NextResponse } from "next/server";
import { pathKeyOf } from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";
import { getAccountForUser } from "@/lib/plan";
import { getPageForUser, requireUserId } from "@/lib/projects";
import { enqueueCrawlPage, getCrawlPageJobs } from "@/lib/queue";

/**
 * Makes a Standard page Priority and fetches its full content now.
 *
 * A Standard Crawl keeps a page's counts and links but not its text, which
 * Page Intelligence and AI need. This queues a Priority fetch of that one page
 * (nothing else on the site is requested) and records the choice so later
 * crawls keep it Priority. The plan's Priority cap is enforced here and again
 * by the worker.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to change page priority." }, { status: 401 });
  }
  const { id, pageId } = await params;
  const [page, account] = await Promise.all([getPageForUser(id, pageId, userId), getAccountForUser(userId)]);
  if (!page) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }
  if (!page.crawlId || page.crawlId !== page.project.latestCrawlId) {
    return NextResponse.json({ error: "This page is from an earlier crawl. Open it from the latest crawl." }, { status: 409 });
  }
  if (page.crawlTier === "priority" && page.content) {
    return NextResponse.json({ error: "This page is already Priority, with its full content." }, { status: 409 });
  }
  if (page.status === "crawling") {
    return NextResponse.json({ ok: true, queued: false, message: "The full page is being fetched now." });
  }
  if (page.status === "failed") {
    return NextResponse.json(
      { error: "This page could not be fetched in the last crawl. Re-crawl the site once it answers." },
      { status: 409 },
    );
  }

  const inUse = await prisma.page.count({
    where: { crawlId: page.crawlId, crawlTier: "priority", NOT: { id: page.id } },
  });
  if (inUse >= account.limits.priorityPages) {
    return NextResponse.json(
      {
        error:
          account.plan === "free"
            ? `${account.limits.label} includes ${account.limits.priorityPages} Priority page, your homepage. Upgrade to make more pages Priority.`
            : `${account.limits.label} includes ${account.limits.priorityPages} Priority pages per crawl, and all are in use. Move one to Standard in the crawl plan first.`,
        upgrade: account.plan === "free",
        code: "priority-limit",
      },
      { status: 402 },
    );
  }

  let waiting: string[] = [];
  try {
    waiting = await getCrawlPageJobs(page.projectId);
  } catch {
    return NextResponse.json({ error: "The crawler queue is offline. Please try again shortly." }, { status: 503 });
  }
  if (waiting.includes(page.id)) {
    return NextResponse.json({ ok: true, queued: false, message: "Already queued. The full page appears here shortly." });
  }

  try {
    await enqueueCrawlPage({ projectId: page.projectId, pageId: page.id, path: pathKeyOf(page.finalUrl ?? page.url) });
  } catch (error) {
    console.error("Failed to enqueue priority fetch", error);
    return NextResponse.json({ error: "The crawler queue is offline. Please try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, queued: true });
}
