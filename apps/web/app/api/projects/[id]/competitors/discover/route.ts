import { activeSearchQueries, loadProjectSearchContext } from "@seo-maker/ai";
import { prisma, readCompetitorProgress, resetCompetitorProgress, setCompetitorStatus } from "@seo-maker/db";
import { NextResponse } from "next/server";
import { aiConfigured, capabilityDenied, notConfigured, refund, requestKeyOf, reserveGeneration } from "@/lib/ai-access";
import { COMP_ACTIVE, serpConfigured } from "@/lib/competitors";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueCompetitorDiscover } from "@/lib/queue";

/**
 * Automatic competitor discovery: finds the one strongest competitor in the
 * project's searches. Long-running, so it only queues a job.
 *
 *   plan includes competitors and Competitor AI?      403 / 402
 *   a search results provider configured?             409 no-provider
 *   business profile complete, market named?          422 profile-required, with what is missing
 *   already running?                                  200, not queued again
 *   -> one AI generation reserved (the search queries; refunded when cached)
 *   -> job queued; progress on the project row
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to discover competitors." }, { status: 401 });
  }

  const { id } = await params;
  const [project, account] = await Promise.all([getProjectForUser(id, userId), getAccountForUser(userId)]);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (account.limits.maxCompetitors === 0) {
    return NextResponse.json({ error: "Upgrade your plan to track competitors.", upgrade: true }, { status: 403 });
  }
  const denied = capabilityDenied(account, "competitor");
  if (denied) return denied;

  if (!serpConfigured()) {
    return NextResponse.json(
      {
        error: "Automatic discovery needs a configured search results provider. You can still add competitors yourself.",
        code: "no-provider",
      },
      { status: 409 },
    );
  }

  const context = await loadProjectSearchContext(project.id);
  if (!context) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (context.gaps.length > 0 || !context.searchMarket) {
    return NextResponse.json(
      {
        error: "To find relevant competitors, SEO Maker needs to understand your business.",
        code: "profile-required",
        missing: context.gaps,
      },
      { status: 422 },
    );
  }

  const progress = await readCompetitorProgress(prisma, project.id);
  if (COMP_ACTIVE.has(progress.compStatus)) {
    return NextResponse.json({ ok: true, queued: false, message: "Discovery is already running." });
  }

  // Search queries come from AI unless a set is already stored for this market.
  const stored = await activeSearchQueries(project.id, context.searchMarket);
  if (!aiConfigured() && stored.length === 0) return notConfigured();

  const body = (await request.json().catch(() => ({}))) as { requestId?: unknown };
  const reservation = await reserveGeneration({
    userId,
    account,
    scope: "competitor",
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

  await resetCompetitorProgress(prisma, project.id, { status: "queued", total: 0, providerOk: true });
  await setCompetitorStatus(prisma, project.id, { status: "queued", providerOk: true });
  try {
    await enqueueCompetitorDiscover({ projectId: project.id, mode: "full", usageId: reservation.usageId });
  } catch (error) {
    console.error("Failed to enqueue competitor discovery", error);
    await refund(reservation.usageId, "could not queue");
    await setCompetitorStatus(prisma, project.id, { status: "failed", error: "Queue is not running." });
    return NextResponse.json({ error: "Queue is not running. Start Redis and the worker." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
