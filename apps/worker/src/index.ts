import {
  AI_COMPETITOR_INSIGHT_JOB,
  AI_COMPETITOR_QUEUE,
  AI_PAGE_ANALYZE_JOB,
  AI_PAGE_QUEUE,
  AI_SITE_ANALYZE_JOB,
  AI_SITE_QUEUE,
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_DISCOVER_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_PAGE_JOB,
  CRAWL_QUEUE,
  DISCOVER_SITE_JOB,
  RUN_PERFORMANCE_JOB,
  aiStopKey,
  type AiCompetitorInsightJob,
  type AiPageAnalyzeJob,
  type AiSiteAnalyzeJob,
  type CompetitorAnalyzeOneJob,
  type CompetitorDiscoverJob,
  type CrawlPageJob,
  type DiscoverSiteJob,
} from "@seo-maker/core/queue";
import { expireStaleReservations, prisma, settleUsage } from "@seo-maker/db";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { aiAnalyzePageJob } from "./jobs/ai/analyze-page.js";
import { aiAnalyzeSiteJob } from "./jobs/ai/analyze-site.js";
import { aiCompetitorInsightJob } from "./jobs/ai/competitor-insight.js";
import { competitorAnalyzeOneJob } from "./jobs/competitors/analyze-one.js";
import { competitorDiscoverJob } from "./jobs/competitors/discover.js";
import { crawlPageJob } from "./jobs/crawl-page";
import { crawlHomepageJob, recoverInterruptedCrawls, type CrawlHomepageJob } from "./jobs/crawl-site";
import { discoverSiteJob } from "./jobs/discover-site";
import { runPerformanceJob, type RunPerformanceJob } from "./jobs/run-performance";
import { watchForStop } from "./lib/stop-signal";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380";

// Before taking new work, close out crawls a previous process left running.
const recovered = await recoverInterruptedCrawls().catch((error) => {
  console.error("Could not recover interrupted crawls:", error);
  return 0;
});
if (recovered > 0) {
  console.log(`Marked ${recovered} interrupted crawl(s) as failed.`);
}
// A discovery run is never retried by BullMQ, so one a stopped worker left
// "running" would show progress forever. Nothing runs yet at startup.
const interruptedDiscoveries = await prisma.project
  .updateMany({
    where: { compStatus: "running" },
    data: { compStatus: "failed", compPhase: null, compError: "Interrupted: the worker stopped during competitor discovery. Run it again." },
  })
  .catch(() => ({ count: 0 }));
if (interruptedDiscoveries.count > 0) {
  console.log(`Marked ${interruptedDiscoveries.count} interrupted competitor discovery run(s) as failed.`);
}
// Usage reservations whose job never reported back stop counting after their
// TTL anyway; this records it, so the ledger explains itself.
const expired = await expireStaleReservations(prisma).catch(() => 0);
if (expired > 0) {
  console.log(`Released ${expired} stale usage reservation(s).`);
}
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const crawlWorker = new Worker<CrawlHomepageJob | RunPerformanceJob | CrawlPageJob | DiscoverSiteJob>(
  CRAWL_QUEUE,
  async (job) => {
    if (job.name === CRAWL_HOMEPAGE_JOB) {
      console.log(`Crawl ${job.id}: ${(job.data as CrawlHomepageJob).url}`);
      await crawlHomepageJob(job.data as CrawlHomepageJob);
      console.log(`Crawl ${job.id}: done`);
      return;
    }

    if (job.name === DISCOVER_SITE_JOB) {
      const payload = job.data as DiscoverSiteJob;
      console.log(`Discovery ${job.id}: ${payload.mode}`);
      await discoverSiteJob(payload);
      return;
    }

    if (job.name === CRAWL_PAGE_JOB) {
      const payload = job.data as CrawlPageJob;
      console.log(`${payload.mode === "recrawl" ? "Crawl page" : "Priority fetch"} ${job.id}: ${payload.path}`);
      await crawlPageJob(payload);
      return;
    }

    if (job.name === RUN_PERFORMANCE_JOB) {
      const payload = job.data as RunPerformanceJob;
      const count = payload.pages?.length ?? 1;
      console.log(`Performance ${job.id}: ${count} page${count === 1 ? "" : "s"}`);
      await runPerformanceJob(payload);
      console.log(`Performance ${job.id}: done`);
      return;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: 1, lockDuration: 15 * 60 * 1000 },
);

crawlWorker.on("failed", (job, error) => {
  console.error(`Crawl ${job?.id} failed:`, error);
});

/**
 * Competitor work runs on its own queue so a long discovery run cannot stall
 * crawls and PageSpeed jobs behind it. Longer lock: N competitors x M pages
 * comfortably exceeds the 15 minute crawl lock.
 */
const competitorWorker = new Worker<CompetitorAnalyzeOneJob | CompetitorDiscoverJob>(
  COMPETITOR_QUEUE,
  async (job) => {
    if (job.name === COMPETITOR_DISCOVER_JOB) {
      const payload = job.data as CompetitorDiscoverJob;
      console.log(`Competitor discovery ${job.id}: ${payload.projectId}`);
      const result = await competitorDiscoverJob(payload);
      console.log(`Competitor discovery ${job.id}: ${result?.outcome ?? "did not finish"}`);
      return;
    }

    if (job.name === COMPETITOR_ANALYZE_ONE_JOB) {
      const payload = job.data as CompetitorAnalyzeOneJob;
      console.log(`Competitor ${job.id}: analyzing ${payload.competitorId}`);
      await competitorAnalyzeOneJob(payload);
      console.log(`Competitor ${job.id}: done`);
      return;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: 1, lockDuration: 30 * 60 * 1000 },
);

competitorWorker.on("failed", (job, error) => {
  console.error(`Competitor ${job?.id} failed:`, error);
});

/**
 * Runs one AI job so the user's Stop reaches it.
 *
 * Stop applies to work queued before it was pressed, never to work queued
 * after: the Redis key holds when Stop was pressed, the job when it was
 * queued. A job already stopped is skipped; a running one gets an AbortSignal
 * that cancels its model call.
 */
async function runStoppable(
  label: string,
  projectId: string,
  queuedAt: number,
  work: (signal: AbortSignal) => Promise<void>,
  usageId?: string,
): Promise<void> {
  const stopRequested = async () => {
    const at = Number(await connection.get(aiStopKey(projectId)));
    return Number.isFinite(at) && at >= queuedAt;
  };
  if (await stopRequested().catch(() => false)) {
    console.log(`${label}: skipped, stopped by the user`);
    // Never ran, so never charged.
    if (usageId) await settleUsage(prisma, usageId, "cancelled", "stopped before it started").catch(() => undefined);
    return;
  }
  const stop = watchForStop(stopRequested);
  try {
    await work(stop.signal);
    console.log(`${label}: ${stop.signal.aborted ? "stopped by the user" : "done"}`);
  } finally {
    stop.dispose();
  }
}

/**
 * AI runs on its own queue (Phase 1.9).
 *
 * Separate from the crawler so a slow provider can never stall a crawl.
 * Concurrency defaults to 1: on Groq's free tier (8,000 tokens per minute) one
 * page prompt is ~6,500 tokens, so two concurrent jobs always collide on the
 * rate limit and one of them burns its retries waiting. Raise AI_PAGE_CONCURRENCY
 * on a higher provider tier. Retries are bounded inside the AI layer, so BullMQ
 * does not retry on top: a failed generation is already a recorded AiResult row.
 */
const aiConcurrency = Math.max(1, Number(process.env.AI_PAGE_CONCURRENCY) || 1);
const aiPageWorker = new Worker<AiPageAnalyzeJob>(
  AI_PAGE_QUEUE,
  async (job) => {
    if (job.name === AI_PAGE_ANALYZE_JOB) {
      const payload = job.data;
      await runStoppable(`AI page ${job.id}`, payload.projectId, job.timestamp, async (signal) => {
        console.log(`AI page ${job.id}: ${payload.pageId} (${payload.mode})`);
        await aiAnalyzePageJob(payload, signal);
      }, payload.usageId);
      return;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: aiConcurrency, lockDuration: 5 * 60 * 1000 },
);

aiPageWorker.on("failed", (job, error) => {
  console.error(`AI page ${job?.id} failed:`, error);
});

/**
 * Site-level AI (Phase 3.3) and competitor AI (Phase 4.1), one queue each so a
 * site-wide run never waits behind a batch of pages, or the reverse. One job
 * at a time on each: a site or competitor prompt is a single large call, and
 * on a per-minute token limit two at once only collide. Provider retries and
 * rate-limit waits happen inside the AI layer; BullMQ does not retry on top.
 */
const aiSiteWorker = new Worker<AiSiteAnalyzeJob>(
  AI_SITE_QUEUE,
  async (job) => {
    if (job.name !== AI_SITE_ANALYZE_JOB) throw new Error(`Unknown job name: ${job.name}`);
    const payload = job.data;
    await runStoppable(
      `AI site ${job.id}`,
      payload.projectId,
      job.timestamp,
      (signal) => aiAnalyzeSiteJob(payload, signal),
      payload.usageId,
    );
  },
  { connection, concurrency: 1, lockDuration: 5 * 60 * 1000 },
);

aiSiteWorker.on("failed", (job, error) => {
  console.error(`AI site ${job?.id} failed:`, error);
});

const aiCompetitorWorker = new Worker<AiCompetitorInsightJob>(
  AI_COMPETITOR_QUEUE,
  async (job) => {
    if (job.name !== AI_COMPETITOR_INSIGHT_JOB) throw new Error(`Unknown job name: ${job.name}`);
    const payload = job.data;
    await runStoppable(
      `AI competitor ${job.id}`,
      payload.projectId,
      job.timestamp,
      (signal) => aiCompetitorInsightJob(payload, signal),
      payload.usageId,
    );
  },
  // One call per competitor, so a project with many runs for a while.
  { connection, concurrency: 1, lockDuration: 10 * 60 * 1000 },
);

aiCompetitorWorker.on("failed", (job, error) => {
  console.error(`AI competitor ${job?.id} failed:`, error);
});

console.log(
  `Worker listening on ${CRAWL_QUEUE}, ${COMPETITOR_QUEUE}, ${AI_PAGE_QUEUE}, ${AI_SITE_QUEUE} and ${AI_COMPETITOR_QUEUE} (${redisUrl})`,
);
