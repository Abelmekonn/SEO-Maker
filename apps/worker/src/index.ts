import {
  AI_PAGE_ANALYZE_JOB,
  AI_PAGE_QUEUE,
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_QUEUE,
  RUN_PERFORMANCE_JOB,
  aiStopKey,
  type AiPageAnalyzeJob,
  type CompetitorAnalyzeOneJob,
} from "@seo-maker/core/queue";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { aiAnalyzePageJob } from "./jobs/ai/analyze-page.js";
import { competitorAnalyzeOneJob } from "./jobs/competitors/analyze-one.js";
import { crawlHomepageJob, recoverInterruptedCrawls, type CrawlHomepageJob } from "./jobs/crawl-site";
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
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const crawlWorker = new Worker<CrawlHomepageJob | RunPerformanceJob>(
  CRAWL_QUEUE,
  async (job) => {
    if (job.name === CRAWL_HOMEPAGE_JOB) {
      console.log(`Crawl ${job.id}: ${(job.data as CrawlHomepageJob).url}`);
      await crawlHomepageJob(job.data as CrawlHomepageJob);
      console.log(`Crawl ${job.id}: done`);
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
const competitorWorker = new Worker<CompetitorAnalyzeOneJob>(
  COMPETITOR_QUEUE,
  async (job) => {
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
      // Stop applies to work queued before it was pressed, never to work
      // queued after: the key holds when Stop was pressed, the job when it was
      // queued.
      const stopRequested = async () => {
        const at = Number(await connection.get(aiStopKey(payload.projectId)));
        return Number.isFinite(at) && at >= job.timestamp;
      };
      if (await stopRequested().catch(() => false)) {
        console.log(`AI page ${job.id}: skipped, stopped by the user`);
        return;
      }
      const stop = watchForStop(stopRequested);
      try {
        console.log(`AI page ${job.id}: ${payload.pageId} (${payload.mode})`);
        await aiAnalyzePageJob(payload, stop.signal);
        console.log(`AI page ${job.id}: ${stop.signal.aborted ? "stopped by the user" : "done"}`);
      } finally {
        stop.dispose();
      }
      return;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: aiConcurrency, lockDuration: 5 * 60 * 1000 },
);

aiPageWorker.on("failed", (job, error) => {
  console.error(`AI page ${job?.id} failed:`, error);
});

console.log(
  `Worker listening on ${CRAWL_QUEUE}, ${COMPETITOR_QUEUE} and ${AI_PAGE_QUEUE} (${redisUrl})`,
);
