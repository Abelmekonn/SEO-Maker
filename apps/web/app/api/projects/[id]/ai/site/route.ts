import { NextResponse } from "next/server";
import { syncSiteOpportunities } from "@seo-maker/ai";
import type { AiSiteTask } from "@seo-maker/core/queue";
import {
  aiConfigured,
  capabilityDenied,
  getUserQuota,
  notConfigured,
  refund,
  requestKeyOf,
  reserveGeneration,
} from "@/lib/ai-access";
import { getSiteStrategy } from "@/lib/site-strategy";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { enqueueAiSiteAnalysis, getAiSiteJobs } from "@/lib/queue";

/**
 * Site AI. Only ever started by the user.
 *
 * POST { task: "strategy" | "opportunities", force?, requestId? }
 *   strategy       content opportunities, topic structure, internal-link
 *                  strategy, site architecture and content strategy
 *   opportunities  AI explanations for the site opportunities code found
 *
 * GET  whether a Site AI job is running, and the latest strategy.
 *
 * One generation from the user's allowance per request, settled by the
 * worker. The deterministic opportunities are re-derived first; they never
 * depend on the model.
 */

/** A site prompt with its answer; refuse below this much system capacity. */
const SITE_CALL_TOKENS = 10_000;

async function access(id: string) {
  const userId = await requireUserId();
  if (!userId) {
    return { error: NextResponse.json({ error: "Sign in to use Site AI." }, { status: 401 }) };
  }
  const [project, account] = await Promise.all([getProjectForUser(id, userId), getAccountForUser(userId)]);
  if (!project) {
    return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  }
  return { userId, project, account };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await access(id);
  if ("error" in result) return result.error;
  const { project, account, userId } = result;

  let jobs: Awaited<ReturnType<typeof getAiSiteJobs>> = [];
  let queueOnline = true;
  try {
    jobs = await getAiSiteJobs(project.id);
  } catch {
    queueOnline = false;
  }
  const [strategy, quota] = await Promise.all([getSiteStrategy(project.id), getUserQuota(userId, account.limits)]);
  return NextResponse.json({
    queueOnline,
    running: jobs.map((job) => ({ state: job.state, task: job.data.task ?? "opportunities" })),
    strategy,
    quota,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await access(id);
  if ("error" in result) return result.error;
  const { project, account, userId } = result;

  const denied = capabilityDenied(account, "site");
  if (denied) return denied;
  if (!aiConfigured()) return notConfigured();

  const body = (await request.json().catch(() => ({}))) as { task?: unknown; force?: unknown; requestId?: unknown };
  const task: AiSiteTask = body.task === "opportunities" ? "opportunities" : "strategy";

  const synced = await syncSiteOpportunities(project.id);
  if (!synced) {
    return NextResponse.json(
      { error: "Crawl the site first. Site AI works from a complete crawl." },
      { status: 409 },
    );
  }
  if (task === "opportunities" && synced.candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      queued: false,
      message: "Nothing to explain: the crawl found no site-level opportunities.",
    });
  }

  let running: Awaited<ReturnType<typeof getAiSiteJobs>> = [];
  try {
    running = await getAiSiteJobs(project.id);
  } catch {
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }
  if (running.some((job) => (job.data.task ?? "opportunities") === task)) {
    return NextResponse.json({ ok: true, queued: false, message: "Already running. Results appear here when it finishes." });
  }

  const reservation = await reserveGeneration({
    userId,
    account,
    scope: "site",
    projectId: project.id,
    siteKey: project.siteKey,
    features: [task],
    requestKey: requestKeyOf(request, body),
    capacityNeeded: SITE_CALL_TOKENS,
  });
  if (!reservation.ok) return reservation.response;
  if (reservation.replayed) {
    return NextResponse.json({ ok: true, queued: false, message: "Already requested. Results appear here when it finishes." });
  }

  try {
    await enqueueAiSiteAnalysis({
      projectId: project.id,
      crawlId: synced.loaded.crawlId,
      mode: project.analysisMode === "deep" ? "deep" : "quick",
      force: body.force === true,
      task,
      usageId: reservation.usageId,
    });
  } catch (error) {
    console.error("Failed to enqueue site analysis", error);
    await refund(reservation.usageId, "could not queue");
    return NextResponse.json({ error: "The AI queue is offline. Please try again shortly." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, queued: true, task, quota: reservation.quota });
}
