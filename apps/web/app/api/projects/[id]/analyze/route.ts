import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { aiConfigured } from "@/lib/ai-results";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueAiPageAnalysis } from "@/lib/queue";

/**
 * Queues grounded AI analysis (Phase 1.9).
 *
 * Body: `{ pageId?: string, force?: boolean }`. With a pageId it analyses that
 * page; without one it queues every crawled page in the latest crawl that has
 * something to explain.
 *
 * Pages with no failing checks are skipped rather than queued. The worker would
 * return early on them anyway, and queuing work that is guaranteed to no-op
 * makes the progress count lie about how much is left.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run analysis." }, { status: 401 });
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "No AI provider is configured. Set AI_API_KEY and restart the worker." },
      { status: 503 },
    );
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    pageId?: string;
    force?: boolean;
  };

  const mode = project.analysisMode === "deep" ? "deep" : "quick";

  const candidates = body.pageId
    ? project.pages.filter((page) => page.id === body.pageId)
    : project.pages;

  if (body.pageId && candidates.length === 0) {
    return NextResponse.json({ error: "Page not found in this project." }, { status: 404 });
  }

  const pageIds = candidates.map((page) => page.id);
  const withIssues = await prisma.pageIssue.groupBy({
    by: ["pageId"],
    where: { pageId: { in: pageIds } },
    _count: { pageId: true },
  });
  const analysable = new Set(withIssues.map((row) => row.pageId));

  const targets = candidates.filter((page) => analysable.has(page.id));

  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      message: "Nothing to analyse. These pages have no failing checks.",
    });
  }

  try {
    await Promise.all(
      targets.map((page) =>
        enqueueAiPageAnalysis({
          projectId: project.id,
          pageId: page.id,
          mode,
          force: body.force ?? false,
        }),
      ),
    );
  } catch (error) {
    console.error("Failed to enqueue AI analysis", error);
    return NextResponse.json(
      { error: "Queue is not running. Start Redis and the worker." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, queued: targets.length, mode });
}
