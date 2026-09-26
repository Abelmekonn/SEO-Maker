import { NextResponse } from "next/server";
import { assertSafeUrl } from "@seo-maker/core/net";
import { prisma } from "@seo-maker/db";
import {
  contextToPrisma,
  hasAnyContext,
  isAnalysisMode,
  parseBusinessContext,
} from "@/lib/business-context";
import { siteCrawlAllowance } from "@/lib/crawl-access";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";
import { enqueueDiscovery } from "@/lib/queue";
import { normalizeSiteUrl, siteKeyOf } from "@/lib/site-url";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view projects." }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to start a project." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const rawUrl = typeof body?.url === "string" ? body.url : "";
  const normalized = normalizeSiteUrl(rawUrl);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  // The worker enforces this too, but refusing here means a project is never
  // created for a host we will not crawl. `normalizeSiteUrl` only checks the
  // shape of the string; it has never checked where the name resolves to.
  const safe = await assertSafeUrl(normalized.href);
  if (!safe.ok) {
    return NextResponse.json(
      {
        error:
          safe.reason === "dns"
            ? "We could not resolve that domain. Check the spelling and try again."
            : "That address is not a public website we can crawl.",
      },
      { status: 400 },
    );
  }

  // One project per site. Re-crawling is how a site is refreshed; adding it
  // again would split its history across two projects. The unique index on
  // (userId, siteKey) enforces this too; checking first gives a useful answer.
  const siteKey = siteKeyOf(normalized.href);
  const duplicate = await prisma.project.findFirst({
    where: { userId, OR: [{ siteKey }, { rootUrl: normalized.href }] },
    select: { id: true, name: true },
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error: `You already added ${siteKey}. Open it and use Re-crawl Site to refresh it.`,
        duplicate: true,
        id: duplicate.id,
      },
      { status: 409 },
    );
  }

  const account = await getAccountForUser(userId);
  const projectCount = await prisma.project.count({ where: { userId } });

  if (projectCount >= account.limits.maxProjects) {
    const existing = await prisma.project.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      {
        error:
          account.plan === "free"
            ? "You have already used your one free project. Upgrade to add more sites."
            : `${account.limits.label} includes ${account.limits.maxProjects} projects.`,
        // Lets the form offer the upgrade path rather than a dead end.
        upgrade: account.plan === "free",
        id: existing?.id,
      },
      { status: 409 },
    );
  }

  // Crawls are counted per site, not per project: a site deleted and added
  // again keeps what it already used.
  const allowance = await siteCrawlAllowance(userId, siteKey, account.limits);
  if (allowance.remaining === 0) {
    return NextResponse.json(
      {
        error: `You have already used ${account.limits.label}'s crawls of ${siteKey}. Upgrade to crawl it again.`,
        upgrade: account.plan === "free",
        code: "recrawl-limit",
      },
      { status: 402 },
    );
  }

  const requested = parseBusinessContext(body?.business);
  const requestedMode = isAnalysisMode(body?.mode)
    ? body.mode
    : hasAnyContext(requested)
      ? "deep"
      : "quick";

  // Deep Analysis is on every plan now; the check stays so a plan without it
  // downgrades to Quick rather than rejecting the whole request.
  const allowDeep = account.limits.deepMode;
  const mode = allowDeep ? requestedMode : "quick";
  const context = allowDeep ? requested : parseBusinessContext(undefined);

  // A new site is discovered first, not crawled: its pages are found and
  // classified Priority or Standard, and the user then starts the crawl of
  // its Priority pages. Nothing is charged until that crawl is started.
  let project;
  try {
    project = await prisma.project.create({
      data: {
        userId,
        rootUrl: normalized.href,
        siteKey,
        name: context.businessName ?? normalized.hostname,
        maxPages: account.limits.maxPages,
        status: "discovering",
        discoveryStatus: "queued",
        discoveryMode: "initial",
        analysisMode: mode,
        ...contextToPrisma(context),
        contextUpdatedAt: hasAnyContext(context) ? new Date() : null,
      },
    });
  } catch (error) {
    // Two submits of the same site racing past the check above.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: `You already added ${siteKey}.`, duplicate: true },
        { status: 409 },
      );
    }
    throw error;
  }

  try {
    await enqueueDiscovery({ projectId: project.id, mode: "initial" });
  } catch (error) {
    console.error("Failed to enqueue discovery", error);
    // The site is kept; its overview offers to try again.
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: "failed",
        discoveryStatus: "failed",
        discoveryError: "The crawler queue is offline, so this site's pages could not be discovered. Try again shortly.",
      },
    });
  }

  return NextResponse.json({ id: project.id });
}
