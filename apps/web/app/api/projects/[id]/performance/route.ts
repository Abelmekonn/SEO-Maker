import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueuePerformanceAudit } from "@/lib/queue";

const ACTIVE = new Set(["queued", "running"]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run PageSpeed." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const homepage = project.pages[0];
  if (!homepage) {
    return NextResponse.json({ error: "No homepage to test." }, { status: 400 });
  }

  if (ACTIVE.has(project.perfStatus)) {
    return NextResponse.json(
      { error: "A PageSpeed run is already in progress." },
      { status: 409 },
    );
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { perfStatus: "queued", perfError: null },
  });

  try {
    await enqueuePerformanceAudit({
      projectId: project.id,
      pageId: homepage.id,
      url: homepage.finalUrl ?? homepage.url,
    });
  } catch (error) {
    console.error("Failed to enqueue performance run", error);
    await prisma.project.update({
      where: { id: project.id },
      data: { perfStatus: "failed", perfError: "Queue is not running." },
    });
    return NextResponse.json(
      { error: "Queue is not running. Start Redis and the worker." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
