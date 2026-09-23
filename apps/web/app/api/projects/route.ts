import { NextResponse } from "next/server";
import { assertSafeUrl } from "@seo-maker/core/net";
import { prisma } from "@seo-maker/db";
import {
  contextToPrisma,
  hasAnyContext,
  isAnalysisMode,
  parseBusinessContext,
} from "@/lib/business-context";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";
import { enqueueHomepageCrawl } from "@/lib/queue";
import { normalizeSiteUrl } from "@/lib/site-url";

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

  const requested = parseBusinessContext(body?.business);
  const requestedMode = isAnalysisMode(body?.mode)
    ? body.mode
    : hasAnyContext(requested)
      ? "deep"
      : "quick";

  // Deep mode is a paid capability. Downgrade rather than reject: the user
  // asked for an analysis of a real site, and refusing the whole request over
  // an optional extra would be a worse answer than running the quick pass.
  // Context is dropped with it, so nothing paid-for is stored on a free plan.
  const allowDeep = account.limits.deepMode;
  const mode = allowDeep ? requestedMode : "quick";
  const context = allowDeep ? requested : parseBusinessContext(undefined);

  const project = await prisma.project.create({
    include: { pages: true },
    data: {
      userId,
      rootUrl: normalized.href,
      name: context.businessName ?? normalized.hostname,
      maxPages: account.limits.maxPages,
      status: "pending",
      analysisMode: mode,
      ...contextToPrisma(context),
      contextUpdatedAt: hasAnyContext(context) ? new Date() : null,
      pages: {
        create: {
          url: normalized.href,
          status: "pending",
        },
      },
    },
  });

  const homepage = project.pages[0];
  if (homepage) {
    try {
      await enqueueHomepageCrawl({
        projectId: project.id,
        pageId: homepage.id,
        url: homepage.url,
      });
    } catch (error) {
      console.error("Failed to enqueue homepage crawl", error);
    }
  }

  return NextResponse.json({ id: project.id });
}
