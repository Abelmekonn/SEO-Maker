import { NextResponse } from "next/server";
import { aiConfigured, capabilityDenied, notConfigured, refund, requestKeyOf, reserveGeneration } from "@/lib/ai-access";
import { getCompetitorForUser } from "@/lib/competitors";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";
import { enqueueAiCompetitorInsight, getAiCompetitorJobs } from "@/lib/queue";

/**
 * Competitor AI for one competitor. Only ever started by the user.
 *
 * The comparison itself (the facts) is deterministic and refreshed with every
 * analysis of the competitor; this adds what those facts may mean: site
 * comparison, content and topic gaps, structural differences, opportunities.
 * One generation from the user's allowance, settled by the worker.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; competitorId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to use Competitor AI." }, { status: 401 });
  }
  const account = await getAccountForUser(userId);
  const denied = capabilityDenied(account, "competitor");
  if (denied) return denied;
  if (!aiConfigured()) return notConfigured();

  const { id, competitorId } = await params;
  const competitor = await getCompetitorForUser(id, competitorId, userId);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }
  if (competitor.status !== "ready") {
    return NextResponse.json(
      { error: "Wait for this competitor's analysis to finish first. Competitor AI only works from collected evidence." },
      { status: 409 },
    );
  }
  if (!competitor.project.latestCrawlId) {
    return NextResponse.json({ error: "Crawl your own site first, so there is something to compare with." }, { status: 409 });
  }

  let queued: Awaited<ReturnType<typeof getAiCompetitorJobs>> = [];
  try {
    queued = await getAiCompetitorJobs(id);
  } catch {
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }
  if (queued.some((job) => !job.data.competitorId || job.data.competitorId === competitorId)) {
    return NextResponse.json({ ok: true, queued: false, message: "Already running. Results appear here when it finishes." });
  }

  const body = (await request.json().catch(() => ({}))) as { force?: unknown; requestId?: unknown };
  const reservation = await reserveGeneration({
    userId,
    account,
    scope: "competitor",
    projectId: id,
    siteKey: competitor.project.siteKey,
    features: ["competitor-insight"],
    requestKey: requestKeyOf(request, body),
    capacityNeeded: 8_000,
  });
  if (!reservation.ok) return reservation.response;
  if (reservation.replayed) {
    return NextResponse.json({ ok: true, queued: false, message: "Already requested. Results appear here when it finishes." });
  }

  try {
    await enqueueAiCompetitorInsight({
      projectId: id,
      competitorId,
      mode: competitor.project.analysisMode === "deep" ? "deep" : "quick",
      force: body.force === true,
      usageId: reservation.usageId,
    });
  } catch (error) {
    console.error("Failed to enqueue competitor insight", error);
    await refund(reservation.usageId, "could not queue");
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, queued: true, quota: reservation.quota });
}
