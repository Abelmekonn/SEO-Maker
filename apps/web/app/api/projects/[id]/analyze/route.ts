import { NextResponse } from "next/server";
import { AI_PAGE_FEATURES, type AiPageFeature } from "@seo-maker/core/queue";
import { prisma } from "@seo-maker/db";
import { aiConfigured } from "@/lib/ai-results";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueAiPageAnalysis } from "@/lib/queue";

/**
 * Queues grounded AI analysis (Phase 1.9).
 *
 * Body: `{ pageId?: string, force?: boolean, features?: AiPageFeature[] }`.
 * With a pageId it analyses that page; without one it queues every crawled
 * page in the latest crawl that has something to explain. `features` narrows
 * the run (Phase 2); omitted, the worker explains every failing check and
 * generates a fix for each one the fix plan routes to AI.
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

  // Plan gate before the provider check: a free user should be told they need
  // to upgrade, not that the server is missing a key. Enforced here and not
  // only in the UI, because a hidden button is not an access control.
  const account = await getAccountForUser(userId);
  if (!account.limits.ai) {
    return NextResponse.json(
      {
        error: `${account.limits.label} finds the problems on your pages. AI explanations and fixes are a paid feature.`,
        upgrade: true,
      },
      { status: 402 },
    );
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
    features?: unknown;
  };

  const allowed = new Set<string>(AI_PAGE_FEATURES);
  const features = Array.isArray(body.features)
    ? (body.features.filter((value) => typeof value === "string" && allowed.has(value)) as AiPageFeature[])
    : undefined;
  if (Array.isArray(body.features) && features?.length === 0) {
    return NextResponse.json({ error: "No valid features requested." }, { status: 400 });
  }
  // Title and meta can be rewritten on request even when their check passes.
  const onDemand = Boolean(body.pageId && features?.some((feature) => feature === "title" || feature === "meta"));

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

  const targets = candidates.filter((page) => analysable.has(page.id) || onDemand);

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
          features,
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
