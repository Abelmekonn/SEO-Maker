import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
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

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const rawUrl = typeof body?.url === "string" ? body.url : "";
  const normalized = normalizeSiteUrl(rawUrl);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
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
            ? "Free includes one project. Open the project you already started."
            : `${account.limits.label} includes ${account.limits.maxProjects} projects.`,
        id: existing?.id,
      },
      { status: 409 },
    );
  }

  const project = await prisma.project.create({
    include: { pages: true },
    data: {
      userId,
      rootUrl: normalized.href,
      name: normalized.hostname,
      maxPages: account.limits.maxPages,
      status: "pending",
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
