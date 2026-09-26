import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";
import { loadInventory, priorityLimitFor } from "@/lib/site-inventory";

/**
 * The site's page inventory: every page discovery found, with its Priority /
 * Standard classification.
 *
 * GET lists it. PATCH moves one page between tiers: { pageKey, tier }. Only
 * that page's classification changes; nothing is re-discovered or crawled,
 * and every other page keeps its tier. The page is fetched at its new tier by
 * the next crawl that includes it. The plan's Priority cap is enforced here
 * and again by the worker when a crawl runs.
 */

async function load(id: string, userId: string) {
  const [project, account] = await Promise.all([
    prisma.project.findFirst({
      where: { id, userId },
      select: { id: true, rootUrl: true, latestCrawlId: true, pagePriorityOverrides: true },
    }),
    getAccountForUser(userId),
  ]);
  return { project, account };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view the page inventory." }, { status: 401 });
  }
  const { id } = await params;
  const { project, account } = await load(id, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const rows = await loadInventory(project, account.limits);
  return NextResponse.json({
    priorityLimit: priorityLimitFor(account.limits),
    pages: rows.map((row) => ({
      pageKey: row.pageKey,
      url: row.url,
      path: row.path,
      homepage: row.homepage,
      tier: row.tier,
      tierSource: row.tierSource,
      pageType: row.pageType,
      level: row.level,
      discoveredAt: row.discoveredAt,
      lastCrawledAt: row.lastCrawledAt,
    })),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to change page priority." }, { status: 401 });
  }
  const { id } = await params;
  const { project, account } = await load(id, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { pageKey?: unknown; tier?: unknown } | null;
  const tier = body?.tier === "priority" || body?.tier === "standard" ? body.tier : null;
  if (typeof body?.pageKey !== "string" || !tier) {
    return NextResponse.json({ error: 'Send `pageKey` and `tier` ("priority" or "standard").' }, { status: 400 });
  }

  await loadInventory(project, account.limits);
  const page = await prisma.sitePage.findUnique({
    where: { projectId_pageKey: { projectId: project.id, pageKey: body.pageKey } },
    select: { id: true, tier: true, path: true },
  });
  if (!page) {
    return NextResponse.json({ error: "That page is not in this site's page inventory." }, { status: 404 });
  }
  if (page.tier === tier) {
    return NextResponse.json({ ok: true, pageKey: body.pageKey, tier });
  }

  if (tier === "priority") {
    const limit = priorityLimitFor(account.limits);
    const inUse = await prisma.sitePage.count({ where: { projectId: project.id, tier: "priority" } });
    if (inUse >= limit) {
      return NextResponse.json(
        {
          error:
            account.plan === "free"
              ? `${account.limits.label} includes ${limit} Priority page, your homepage. Upgrade to make more pages Priority.`
              : `${account.limits.label} includes up to ${limit} Priority pages, and all are in use. Make one Standard first.`,
          upgrade: account.plan === "free",
          code: "priority-limit",
        },
        { status: 402 },
      );
    }
  }

  await prisma.sitePage.update({ where: { id: page.id }, data: { tier, tierSource: "user" } });
  return NextResponse.json({ ok: true, pageKey: body.pageKey, tier });
}
