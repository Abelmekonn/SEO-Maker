import {
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_QUEUE,
  RUN_PERFORMANCE_JOB,
  type CompetitorAnalyzeOneJob,
} from "@seo-maker/core/queue";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { competitorAnalyzeOneJob } from "./jobs/competitors/analyze-one.js";
import { crawlHomepageJob, type CrawlHomepageJob } from "./jobs/crawl-site";
import { runPerformanceJob, type RunPerformanceJob } from "./jobs/run-performance";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380";
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

console.log(`Worker listening on ${CRAWL_QUEUE} and ${COMPETITOR_QUEUE} (${redisUrl})`);
