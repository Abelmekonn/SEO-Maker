import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueHomepageCrawl } from "@/lib/queue";
import { findHomepage } from "@/lib/site-url";

const RESET = {
  status: "pending",
  finalUrl: null,
  isHttps: null,
  statusCode: null,
  title: null,
  metaDesc: null,
  h1: null,
  h2Count: null,
  canonicalUrl: null,
  wordCount: null,
  imageCount: null,
  missingAlt: null,
  internalLinks: null,
  schemaCount: null,
  robotsTxtUrl: null,
  robotsOk: null,
  sitemapUrl: null,
  hasSitemap: null,
  xRobotsTag: null,
  indexable: null,
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  await prisma.page.updateMany({
    where: { projectId: project.id },
    data: RESET,
  });

  try {
    await enqueueHomepageCrawl({
      projectId: project.id,
      pageId: seed?.id ?? project.id,
      url: startUrl,
    });
  } catch (error) {
    console.error("Failed to enqueue crawl", error);
    return NextResponse.json(
      { error: "Queue is not running. Start Redis and the worker." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, maxPages });
}
