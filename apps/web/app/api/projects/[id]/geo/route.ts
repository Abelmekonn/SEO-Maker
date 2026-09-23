import { NextResponse } from "next/server";
import { prisma, resetGeoProgress } from "@seo-maker/db";
import { GEO_ACTIVE } from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueGeoAudit } from "@/lib/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run an AI Search analysis." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (GEO_ACTIVE.has(project.geoStatus)) {
    return NextResponse.json(
      { error: "An AI Search analysis is already in progress." },
      { status: 409 },
    );
  }

  if (!project.latestCrawlId) {
    return NextResponse.json(
      { error: "Crawl the site before running an AI Search analysis." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as { force?: unknown } | null;
  const force = body?.force === true;

  await resetGeoProgress(prisma, project.id, { status: "queued", total: 4 });

  try {
    await enqueueGeoAudit({
      projectId: project.id,
      crawlId: project.latestCrawlId,
      mode: project.analysisMode === "deep" ? "deep" : "quick",
      trigger: "manual",
      force,
    });
  } catch (error) {
    console.error("Failed to enqueue GEO audit", error);
    await prisma.project.update({
      where: { id: project.id },
      data: { geoStatus: "failed", geoError: "Queue is not running." },
    });
    return NextResponse.json(
      { error: "Queue is not running. Start Redis and the worker." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
