import { loadProjectSearchContext } from "@seo-maker/ai";
import { NextResponse } from "next/server";
import { aiConfigured, capabilityDenied, notConfigured, refund, requestKeyOf, reserveGeneration } from "@/lib/ai-access";
import { getSearchKeywords } from "@/lib/competitors";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueAiSiteAnalysis, getAiSiteJobs } from "@/lib/queue";

/**
 * Search keywords: the few searches a potential customer would make,
 * generated from the business profile. Automatic competitor discovery uses
 * the same set.
 *
 * GET lists them. POST generates them on the Site AI queue (one generation
 * from the allowance, refunded when the answer came from cache); with
 * `force` it asks for a fresh set.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view search keywords." }, { status: 401 });
  }
  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const [state, jobs] = await Promise.all([getSearchKeywords(project.id), getAiSiteJobs(project.id).catch(() => [])]);
  return NextResponse.json({ ...state, generating: jobs.some((job) => job.data.task === "search-queries") });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to generate search keywords." }, { status: 401 });
  }
  const { id } = await params;
  const [project, account] = await Promise.all([getProjectForUser(id, userId), getAccountForUser(userId)]);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const denied = capabilityDenied(account, "site");
  if (denied) return denied;
  if (!aiConfigured()) return notConfigured();

  const context = await loadProjectSearchContext(project.id);
  if (!context) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (context.gaps.length > 0 || !context.searchMarket) {
    return NextResponse.json(
      {
        error: "Search keywords are generated from your business profile. Complete it first.",
        code: "profile-required",
        missing: context.gaps,
      },
      { status: 422 },
    );
  }

  let jobs: Awaited<ReturnType<typeof getAiSiteJobs>> = [];
  try {
    jobs = await getAiSiteJobs(project.id);
  } catch {
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }
  if (jobs.some((job) => job.data.task === "search-queries")) {
    return NextResponse.json({ ok: true, queued: false, message: "Already generating. The keywords appear here when ready." });
  }

  const body = (await request.json().catch(() => ({}))) as { force?: unknown; requestId?: unknown };
  const reservation = await reserveGeneration({
    userId,
    account,
    scope: "site",
    projectId: project.id,
    siteKey: project.siteKey,
    features: ["search-queries"],
    requestKey: requestKeyOf(request, body),
    capacityNeeded: 3_000,
  });
  if (!reservation.ok) return reservation.response;
  if (reservation.replayed) {
    return NextResponse.json({ ok: true, queued: false, message: "Already requested." });
  }

  try {
    await enqueueAiSiteAnalysis({
      projectId: project.id,
      mode: "deep",
      task: "search-queries",
      force: body.force === true,
      usageId: reservation.usageId,
    });
  } catch (error) {
    console.error("Failed to enqueue search keyword generation", error);
    await refund(reservation.usageId, "could not queue");
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, queued: true, quota: reservation.quota }, { status: 202 });
}
