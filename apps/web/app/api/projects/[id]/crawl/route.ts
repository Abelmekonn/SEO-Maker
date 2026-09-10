import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueHomepageCrawl } from "@/lib/queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run a crawl." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const homepage = project.pages[0];
  if (!homepage) {
    return NextResponse.json({ error: "No homepage to crawl." }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "pending" },
  });
  await prisma.page.update({
    where: { id: homepage.id },
    data: {
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
    },
  });

  try {
    await enqueueHomepageCrawl({
      projectId: project.id,
      pageId: homepage.id,
      url: homepage.url,
    });
  } catch (error) {
    console.error("Failed to enqueue homepage crawl", error);
    return NextResponse.json(
      { error: "Queue is not running. Start Redis and the worker." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
