import { NextResponse } from "next/server";
import { syncSiteOpportunities } from "@seo-maker/ai";
import { aiConfigured, capabilityDenied, notConfigured, refund, requestKeyOf, reserveGeneration } from "@/lib/ai-access";
import { ensureSiteOpportunities, getOpportunities } from "@/lib/opportunities";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueAiSiteAnalysis, getAiSiteJobs } from "@/lib/queue";

/**
 * Site opportunities (Phase 3.3).
 *
 * GET lists them. POST re-derives them from the latest crawl now, which is
 * deterministic and free, and with `{ explain: true }` also queues the AI job
 * that writes their wording. Scores never come from the AI.
 */

/** A site prompt with its answer is a few thousand tokens; refuse below this. */
const SITE_CALL_TOKENS = 8_000;

async function access(id: string) {
  const userId = await requireUserId();
  if (!userId) {
    return { error: NextResponse.json({ error: "Sign in to view opportunities." }, { status: 401 }) };
  }
  const [project, account] = await Promise.all([getProjectForUser(id, userId), getAccountForUser(userId)]);
  if (!project) {
    return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  }
  // Same rule as the Opportunities screen: a hidden button is not an access control.
  if (account.plan === "free") {
    return {
      error: NextResponse.json(
        { error: "Site opportunities are part of the Pro and Agency plans.", upgrade: true },
        { status: 402 },
      ),
    };
  }
  return { project, account, userId };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await access(id);
  if ("error" in result) return result.error;
  await ensureSiteOpportunities(result.project);
  const opportunities = await getOpportunities(result.project, result.project.pages);
  return NextResponse.json({ opportunities });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await access(id);
  if ("error" in result) return result.error;
  const { project, account } = result;

  const body = (await request.json().catch(() => ({}))) as { explain?: unknown; force?: unknown; requestId?: unknown };
  const explain = body.explain === true;

  const synced = await syncSiteOpportunities(project.id);
  if (!synced) {
    return NextResponse.json({ error: "Crawl the site first. Opportunities come from a complete crawl." }, { status: 409 });
  }
  const counts = {
    opportunities: synced.candidates.length,
    created: synced.created,
    resolved: synced.resolved,
  };
  if (!explain) {
    return NextResponse.json({ ok: true, ...counts, queued: false });
  }

  const denied = capabilityDenied(account, "site");
  if (denied) return denied;
  if (!aiConfigured()) return notConfigured();
  if (synced.candidates.length === 0) {
    return NextResponse.json({ ok: true, ...counts, queued: false, message: "Nothing to explain: the crawl found no site-level opportunities." });
  }

  let running = 0;
  try {
    running = (await getAiSiteJobs(project.id)).length;
  } catch {
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }
  if (running > 0) {
    return NextResponse.json({ ok: true, ...counts, queued: false, message: "Already being explained. Results appear here when it finishes." });
  }

  const reservation = await reserveGeneration({
    userId: result.userId,
    account,
    scope: "site",
    projectId: project.id,
    siteKey: project.siteKey,
    features: ["opportunities"],
    requestKey: requestKeyOf(request, body as { requestId?: unknown }),
    capacityNeeded: SITE_CALL_TOKENS,
  });
  if (!reservation.ok) return reservation.response;

  try {
    await enqueueAiSiteAnalysis({
      projectId: project.id,
      crawlId: synced.loaded.crawlId,
      mode: project.analysisMode === "deep" ? "deep" : "quick",
      force: body.force === true,
      task: "opportunities",
      usageId: reservation.usageId,
    });
  } catch (error) {
    console.error("Failed to enqueue site analysis", error);
    await refund(reservation.usageId, "could not queue");
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...counts, queued: true });
}
