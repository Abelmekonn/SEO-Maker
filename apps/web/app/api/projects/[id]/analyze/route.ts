import { NextResponse } from "next/server";
import { buildSiteContext, imageInputAvailable, linkTargetCount } from "@seo-maker/ai";
import {
  type PageAiOutput,
  featuresForOutputs,
  fixPlanInputFromPage,
  isPageAiOutput,
  pageOutputAvailability,
} from "@seo-maker/core/page";
import { AI_PAGE_FEATURES, type AiPageFeature } from "@seo-maker/core/queue";
import { prisma } from "@seo-maker/db";
import {
  aiConfigured,
  capabilityDenied,
  homepageDenied,
  isHomepage,
  notConfigured,
  refund,
  requestKeyOf,
  reserveGeneration,
} from "@/lib/ai-access";
import { pageKeyIndex } from "@/lib/page-results";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueAiPageAnalysis, getAiQueueJobs } from "@/lib/queue";

/**
 * Page AI: queues grounded AI analysis. Only ever called by a user action.
 *
 * Body:
 *   { pageId, outputs?, force?, requestId? }   one page. `outputs` names what to
 *                                              write (metadata, content, headings,
 *                                              schema, alt-text, internal-links,
 *                                              analysis); omit it to explain every
 *                                              failing check and fix what AI can
 *   { pageId, features? }                      the same, by worker feature name
 *   { next: N, force? }                        the N worst pages not analysed yet
 *
 * Each page queued is one generation from the user's allowance (Free: 2 a
 * day, 10 a week, homepage only), reserved before the job is queued and
 * settled by the worker: nothing new generated, nothing charged. A request
 * that cannot produce anything (no evidence for the outputs asked for, the
 * same page already queued) is answered without charging.
 */

const SEVERITY_WEIGHT: Record<string, number> = { critical: 8, high: 4, medium: 2, low: 1 };
const MAX_BATCH = 25;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run analysis." }, { status: 401 });
  }

  // Plan before provider: a user whose plan lacks the feature is told how to
  // get it, not that the server is missing something.
  const account = await getAccountForUser(userId);
  const denied = capabilityDenied(account, "page");
  if (denied) return denied;
  if (!aiConfigured()) return notConfigured();

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    pageId?: string;
    force?: boolean;
    features?: unknown;
    outputs?: unknown;
    next?: unknown;
    requestId?: unknown;
  };
  const requestKey = requestKeyOf(request, body);

  const allowed = new Set<string>(AI_PAGE_FEATURES);
  const outputs = Array.isArray(body.outputs) ? body.outputs.filter(isPageAiOutput) : null;
  if (Array.isArray(body.outputs) && outputs?.length === 0) {
    return NextResponse.json({ error: "No valid outputs requested." }, { status: 400 });
  }
  const namedFeatures = Array.isArray(body.features)
    ? (body.features.filter((value) => typeof value === "string" && allowed.has(value)) as AiPageFeature[])
    : null;
  if (Array.isArray(body.features) && namedFeatures?.length === 0) {
    return NextResponse.json({ error: "No valid features requested." }, { status: 400 });
  }
  const features: AiPageFeature[] | undefined = outputs
    ? (featuresForOutputs(outputs) as AiPageFeature[])
    : (namedFeatures ?? undefined);

  const next =
    typeof body.next === "number" && Number.isFinite(body.next)
      ? Math.max(1, Math.min(MAX_BATCH, Math.floor(body.next)))
      : null;
  const mode = project.analysisMode === "deep" ? "deep" : "quick";

  let queued: Awaited<ReturnType<typeof getAiQueueJobs>> = [];
  try {
    queued = await getAiQueueJobs(project.id);
  } catch {
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }

  // ------------------------------------------------------------ one page
  if (body.pageId) {
    const page = project.pages.find((row) => row.id === body.pageId);
    if (!page) {
      return NextResponse.json({ error: "Page not found in this project." }, { status: 404 });
    }
    const homepageOnly = homepageDenied(account, page, project.rootUrl);
    if (homepageOnly) return homepageOnly;
    if (page.status !== "analyzed") {
      return NextResponse.json(
        {
          error:
            page.status === "crawling"
              ? "This page is being fetched. Try again when it finishes."
              : "This page was not analysed in the last crawl, so there is no evidence to work from.",
        },
        { status: 409 },
      );
    }

    // Same page already waiting or running: say so, charge nothing.
    if (queued.some((job) => job.pageId === page.id)) {
      return NextResponse.json({ ok: true, queued: 0, message: "Already in the queue. Progress is shown here." });
    }

    // Only ask for what the page has the evidence for; refuse, uncharged,
    // when nothing asked for can be written.
    const [site, issues] = await Promise.all([
      buildSiteContext(project.id),
      prisma.pageIssue.findMany({ where: { pageId: page.id }, select: { checkId: true, status: true, severity: true } }),
    ]);
    const self = page.finalUrl ?? page.url;
    const availability = pageOutputAvailability(
      fixPlanInputFromPage({ ...page, issues }, site ? linkTargetCount(site, self) : 0, {
        imageInput: imageInputAvailable("image-alt"),
      }),
    );
    if (outputs) {
      const possible = outputs.filter((output) => availability[output].available);
      if (possible.length === 0) {
        return NextResponse.json(
          { error: availability[outputs[0] as PageAiOutput].reason, code: "no-evidence" },
          { status: 422 },
        );
      }
    } else if (!features && issues.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        message: "Every check passes on this page, so there is nothing to explain. Ask for a specific output instead.",
      });
    }

    const reservation = await reserveGeneration({
      userId,
      account,
      scope: "page",
      projectId: project.id,
      siteKey: project.siteKey,
      pageKey: pageKeyIndex([page]).keyById.get(page.id) ?? null,
      features: features ?? ["analysis"],
      requestKey,
    });
    if (!reservation.ok) return reservation.response;
    if (reservation.replayed) {
      return NextResponse.json({ ok: true, queued: 0, message: "Already requested. Progress is shown here.", quota: reservation.quota });
    }

    try {
      await enqueueAiPageAnalysis({
        projectId: project.id,
        pageId: page.id,
        mode,
        features,
        force: body.force ?? false,
        usageId: reservation.usageId,
      });
    } catch (error) {
      console.error("Failed to enqueue AI analysis", error);
      await refund(reservation.usageId, "could not queue");
      return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, queued: 1, mode, quota: reservation.quota });
  }

  // ------------------------------------------------------------ a batch
  // A plan with a per-user allowance analyses one page at a time, by choice.
  if (account.limits.aiHomepageOnly || account.limits.aiDailyLimit != null) {
    return NextResponse.json(
      { error: `${account.limits.label} analyses one page at a time. Open the page and choose what to generate.`, upgrade: account.plan === "free" },
      { status: 402 },
    );
  }

  const candidates = project.pages.filter((page) => page.status === "analyzed");
  const pageIds = candidates.map((page) => page.id);
  const keys = pageKeyIndex(candidates);
  const [issues, explained] = await Promise.all([
    prisma.pageIssue.findMany({ where: { pageId: { in: pageIds } }, select: { pageId: true, severity: true } }),
    // By page URL. Only a result written after this crawl fetched the page
    // counts as done: one from an earlier crawl is refreshed by the batch.
    prisma.aiResult.groupBy({
      by: ["pageKey"],
      where: {
        projectId: project.id,
        pageKey: { in: [...keys.idByKey.keys()] },
        feature: "page-recommendation",
        status: "ok",
      },
      _max: { createdAt: true },
    }),
  ]);

  const weight = new Map<string, number>();
  for (const issue of issues) {
    weight.set(issue.pageId, (weight.get(issue.pageId) ?? 0) + (SEVERITY_WEIGHT[issue.severity] ?? 1));
  }

  // One batch at a time: a second press while one runs would queue the next
  // worst pages behind it.
  if (queued.length > 0) {
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

  // Priority pages first: they carry the page text the model grounds its
  // advice in. Within each tier, worst first by severity-weighted issues.
  const standard = (page: { crawlTier: string | null }) => (page.crawlTier === "standard" ? 1 : 0);
  const homeFirst = (page: (typeof candidates)[number]) => (isHomepage(page, project.rootUrl) ? 0 : 1);
  const targets = candidates
    .filter((page) => weight.has(page.id))
    .filter((page) => body.force || !done.has(page.id))
    .sort(
      (a, b) =>
        homeFirst(a) - homeFirst(b) || standard(a) - standard(b) || (weight.get(b.id) ?? 0) - (weight.get(a.id) ?? 0),
    )
    .slice(0, next ?? MAX_BATCH);

  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      message: "Every page with issues has been analysed. Use Re-analyse on a page to run it again.",
    });
  }

  let count = 0;
  for (const page of targets) {
    const reservation = await reserveGeneration({
      userId,
      account,
      scope: "page",
      projectId: project.id,
      siteKey: project.siteKey,
      pageKey: keys.keyById.get(page.id) ?? null,
      features: ["analysis"],
    });
    if (!reservation.ok) {
      if (count === 0) return reservation.response;
      break;
    }
    try {
      await enqueueAiPageAnalysis({
        projectId: project.id,
        pageId: page.id,
        mode,
        force: body.force ?? false,
        usageId: reservation.usageId,
      });
      count += 1;
    } catch (error) {
      console.error("Failed to enqueue AI analysis", error);
      await refund(reservation.usageId, "could not queue");
      if (count === 0) {
        return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
      }
      break;
    }
  }

  return NextResponse.json({
    ok: true,
    queued: count,
    mode,
    message: count < targets.length ? `Queued ${count} of ${targets.length}. The rest can run later.` : undefined,
  });
}
