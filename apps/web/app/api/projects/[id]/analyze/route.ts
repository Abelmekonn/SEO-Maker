import { NextResponse } from "next/server";
import { AI_PAGE_FEATURES, type AiPageFeature } from "@seo-maker/core/queue";
import { prisma } from "@seo-maker/db";
import { aiConfigured } from "@/lib/ai-results";
import { getAiUsage } from "@/lib/ai-usage";
import { pageKeyIndex } from "@/lib/page-results";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueAiPageAnalysis, getAiQueueJobs } from "@/lib/queue";

/**
 * Queues grounded AI analysis.
 *
 * Body:
 *   { pageId, force?, features? }  one page; `features` narrows the run, and
 *                                  title/meta may be requested on a page whose
 *                                  checks pass
 *   { next: N, force? }            the N worst pages not analysed yet
 *   {}                             every page with something to explain
 *
 * Sized for a provider tier measured in tokens per minute and per day (Groq's
 * free tier by default): pages already waiting or running are never queued
 * twice, and a batch is refused or trimmed when today's token budget cannot
 * cover it, instead of queueing work that would fail on a rate limit.
 */

const SEVERITY_WEIGHT: Record<string, number> = { critical: 8, high: 4, medium: 2, low: 1 };
const MAX_BATCH = 25;

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
    next?: unknown;
  };

  const allowed = new Set<string>(AI_PAGE_FEATURES);
  const features = Array.isArray(body.features)
    ? (body.features.filter((value) => typeof value === "string" && allowed.has(value)) as AiPageFeature[])
    : undefined;
  if (Array.isArray(body.features) && features?.length === 0) {
    return NextResponse.json({ error: "No valid features requested." }, { status: 400 });
  }
  const next =
    typeof body.next === "number" && Number.isFinite(body.next)
      ? Math.max(1, Math.min(MAX_BATCH, Math.floor(body.next)))
      : null;

  // Title and meta can be rewritten on request even when their check passes.
  const onDemand = Boolean(body.pageId && features?.some((feature) => feature === "title" || feature === "meta"));
  const mode = project.analysisMode === "deep" ? "deep" : "quick";

  const candidates = body.pageId
    ? project.pages.filter((page) => page.id === body.pageId)
    : project.pages.filter((page) => page.status === "analyzed");
  if (body.pageId && candidates.length === 0) {
    return NextResponse.json({ error: "Page not found in this project." }, { status: 404 });
  }

  const pageIds = candidates.map((page) => page.id);
  const keys = pageKeyIndex(candidates);
  const [issues, explained, usage] = await Promise.all([
    prisma.pageIssue.findMany({
      where: { pageId: { in: pageIds } },
      select: { pageId: true, severity: true },
    }),
    // By page URL. Only a result written after this crawl fetched the page
    // counts as done: one from an earlier crawl is refreshed by the batch
    // (free when the page is unchanged, the AI cache answers it).
    next
      ? prisma.aiResult.groupBy({
          by: ["pageKey"],
          where: {
            projectId: project.id,
            pageKey: { in: [...keys.idByKey.keys()] },
            feature: "page-recommendation",
            status: "ok",
          },
          _max: { createdAt: true },
        })
      : [],
    getAiUsage(),
  ]);

  const weight = new Map<string, number>();
  for (const issue of issues) {
    weight.set(issue.pageId, (weight.get(issue.pageId) ?? 0) + (SEVERITY_WEIGHT[issue.severity] ?? 1));
  }

  let queued: string[] = [];
  try {
    queued = (await getAiQueueJobs(project.id)).map((job) => job.pageId);
  } catch {
    return NextResponse.json({ error: "Queue is not running. Start Redis and the worker." }, { status: 503 });
  }
  const alreadyQueued = new Set(queued);

  // One batch at a time. A second "next N" while one is running would queue
  // the next worst pages behind it, which on a free tier spends a day's
  // budget on a double click. Single-page requests are still allowed.
  if (next && queued.length > 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      message: `A batch is already running (${queued.length} ${queued.length === 1 ? "page" : "pages"} left). Progress is shown here.`,
    });
  }
  const createdById = new Map(candidates.map((page) => [page.id, page.createdAt]));
  const done = new Set(
    explained.flatMap((row) => {
      const pageId = row.pageKey ? keys.idByKey.get(row.pageKey) : undefined;
      const at = row._max.createdAt;
      const fetched = pageId ? createdById.get(pageId) : undefined;
      return pageId && at && fetched && at >= fetched ? [pageId] : [];
    }),
  );

  let targets = candidates.filter((page) => weight.has(page.id) || onDemand);
  const skippedQueued = targets.filter((page) => alreadyQueued.has(page.id)).length;
  targets = targets.filter((page) => !alreadyQueued.has(page.id));

  if (next) {
    // Worst pages first: severity-weighted issue count, and pages the AI has
    // not explained yet before ones it has.
    targets = targets
      .filter((page) => body.force || !done.has(page.id))
      .sort((a, b) => (weight.get(b.id) ?? 0) - (weight.get(a.id) ?? 0))
      .slice(0, next);
  }

  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      message:
        skippedQueued > 0
          ? "Already in the queue. Progress is shown here."
          : next
            ? "Every page with issues has been analysed. Use Re-analyse on a page to run it again."
            : "Nothing to analyse. These pages have no failing checks.",
    });
  }

  // Budget guard. A single page is allowed while anything is left; a batch is
  // trimmed to what the rest of today's budget covers.
  if (usage.remaining < Math.min(usage.tokensPerPage, 4_000)) {
    return NextResponse.json(
      {
        error: `Today's AI budget for this key is used up (${usage.tokens24h.toLocaleString()} of ${usage.budget.toLocaleString()} tokens). It frees up over the next 24 hours.`,
        budget: true,
      },
      { status: 429 },
    );
  }
  let trimmed = 0;
  if (targets.length > 1 && targets.length > usage.pagesLeftToday) {
    const keep = Math.max(1, usage.pagesLeftToday);
    trimmed = targets.length - keep;
    targets = targets.slice(0, keep);
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

  return NextResponse.json({
    ok: true,
    queued: targets.length,
    mode,
    skippedQueued,
    trimmed,
    etaMinutes: (targets.length + queued.length) * usage.minutesPerPage,
    message: trimmed
      ? `Queued ${targets.length}. ${trimmed} more would exceed today's AI budget.`
      : undefined,
  });
}
