import { Worker } from "bullmq";
import IORedis from "ioredis";
import { crawlHomepageJob, type CrawlHomepageJob } from "./jobs/crawl-site";
import {
  runPerformanceJob,
  type RunPerformanceJob,
} from "./jobs/run-performance";

const CRAWL_QUEUE = "crawl-site";
const CRAWL_HOMEPAGE_JOB = "crawl-homepage";
const RUN_PERFORMANCE_JOB = "run-performance";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380";

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker<CrawlHomepageJob | RunPerformanceJob>(
  CRAWL_QUEUE,
  async (job) => {
    if (job.name === CRAWL_HOMEPAGE_JOB) {
      console.log(`Crawl ${job.id}: ${job.data.url}`);
      await crawlHomepageJob(job.data as CrawlHomepageJob);
      console.log(`Crawl ${job.id}: done`);
      return;
    }

    if (job.name === RUN_PERFORMANCE_JOB) {
      console.log(`Performance ${job.id}: ${job.data.url}`);
      await runPerformanceJob(job.data as RunPerformanceJob);
      console.log(`Performance ${job.id}: done`);
      return;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: 1, lockDuration: 15 * 60 * 1000 },
);

worker.on("failed", (job, error) => {
  console.error(`Crawl ${job?.id} failed:`, error);
});

console.log(`Worker listening on ${CRAWL_QUEUE} (${redisUrl})`);
