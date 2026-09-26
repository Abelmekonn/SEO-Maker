import { NextResponse } from "next/server";
import { pathKeyOf } from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";
import { refundUsage, reserveSiteCrawl } from "@/lib/crawl-access";
import { getAccountForUser } from "@/lib/plan";
import { getPageForUser, requireUserId } from "@/lib/projects";
import { enqueueCrawlPage, getCrawlPageJobs } from "@/lib/queue";
import { siteKeyOf } from "@/lib/site-url";

/**
 * "Crawl page": fetches this one page again and re-runs its checks.
 *
 * For a user who changed the page and wants to see whether the change
 * worked. Nothing else on the site is requested, discovered or
 * re-classified: the page is fetched at its own tier and its row in the
 * latest crawl is updated in place. On a plan with limited re-crawls it
 * counts as one, since on a one-page plan the page is the whole site.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to crawl a page." }, { status: 401 });
  }
  const { id, pageId } = await params;
  const [page, account] = await Promise.all([getPageForUser(id, pageId, userId), getAccountForUser(userId)]);
  if (!page) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }
  if (!page.crawlId || page.crawlId !== page.project.latestCrawlId) {
    return NextResponse.json({ error: "This page is from an earlier crawl. Open it from the latest crawl." }, { status: 409 });
  }
  if (page.status === "crawling") {
    return NextResponse.json({ ok: true, queued: false, message: "This page is being fetched now." });
  }
  const crawling = await prisma.crawl.findFirst({
    where: { projectId: page.projectId, status: { in: ["pending", "crawling", "analyzing", "cancelling"] } },
    select: { id: true },
  });
  if (crawling || page.project.status === "pending") {
    return NextResponse.json({ error: "A crawl of this site is running. Crawl this page when it finishes." }, { status: 409 });
  }

  let waiting: string[] = [];
  try {
    waiting = await getCrawlPageJobs(page.projectId);
  } catch {
    return NextResponse.json({ error: "The crawler queue is offline. Please try again shortly." }, { status: 503 });
  }
  if (waiting.includes(page.id)) {
    return NextResponse.json({ ok: true, queued: false, message: "Already queued. This page updates shortly." });
  }

  const reservation = await reserveSiteCrawl({
    userId,
    account,
    siteKey: page.project.siteKey ?? siteKeyOf(page.project.rootUrl),
    projectId: page.projectId,
    scope: "page",
  });
  if (!reservation.ok) return reservation.response;

  try {
    await enqueueCrawlPage({
      projectId: page.projectId,
      pageId: page.id,
      path: pathKeyOf(page.finalUrl ?? page.url),
      mode: "recrawl",
      usageId: reservation.usageId,
    });
  } catch (error) {
    console.error("Failed to enqueue page crawl", error);
    await refundUsage([reservation.usageId], "could not queue");
    return NextResponse.json({ error: "The crawler queue is offline. Please try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, queued: true });
}
