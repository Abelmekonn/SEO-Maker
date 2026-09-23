import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { requireUserId } from "@/lib/projects";
import { stopAiWork } from "@/lib/queue";

/**
 * Stops the project's AI analysis.
 *
 * Pages still waiting come off the queue at once. The page being analysed
 * stops at the worker's next check, within a couple of seconds, and its model
 * call is cancelled rather than finished and paid for. Explanations and fixes
 * already written are kept.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to stop AI analysis." }, { status: 401 });
  }
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId }, select: { id: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const { removed, running } = await stopAiWork(project.id);
    return NextResponse.json({ ok: true, removed, running, state: running > 0 ? "stopping" : "stopped" });
  } catch {
    return NextResponse.json({ error: "Queue is not running. Start Redis and the worker." }, { status: 503 });
  }
}
