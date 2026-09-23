import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { removeProjectJobs } from "@/lib/queue";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view this project." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ project });
}

/**
 * Deletes a site permanently: every crawl, page, issue, performance run, AI
 * result, competitor and opportunity goes with it (they cascade from Project).
 * Queued jobs for it are removed first so nothing runs against a site that no
 * longer exists.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to delete a site." }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId }, select: { id: true, name: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const removedJobs = await removeProjectJobs(project.id).catch(() => 0);
  await prisma.project.delete({ where: { id: project.id } });

  return NextResponse.json({ ok: true, removedJobs });
}
