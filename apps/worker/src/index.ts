import {
  AI_PAGE_ANALYZE_JOB,
  AI_PAGE_QUEUE,
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_QUEUE,
  GEO_AUDIT_JOB,
  GEO_QUEUE,
  RUN_PERFORMANCE_JOB,
  type AiPageAnalyzeJob,
  type CompetitorAnalyzeOneJob,
  type GeoAuditJob,
} from "@seo-maker/core/queue";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { aiAnalyzePageJob } from "./jobs/ai/analyze-page.js";
import { competitorAnalyzeOneJob } from "./jobs/competitors/analyze-one.js";
import { runGeoAuditJob } from "./jobs/geo/run-geo-audit.js";
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

/**
 * AI runs on its own queue (Phase 1.9) at concurrency 2.
 *
 * Separate from the crawler so a slow provider can never stall a crawl, and
 * concurrency above 1 because these jobs are almost entirely network wait.
 * Retries are bounded inside the AI layer, so BullMQ does not retry on top:
 * a failed generation is already a recorded AiResult row.
 */
const aiPageWorker = new Worker<AiPageAnalyzeJob>(
  AI_PAGE_QUEUE,
  async (job) => {
    if (job.name === AI_PAGE_ANALYZE_JOB) {
      const payload = job.data;
      console.log(`AI page ${job.id}: ${payload.pageId} (${payload.mode})`);
      await aiAnalyzePageJob(payload);
      console.log(`AI page ${job.id}: done`);
      return;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: 2, lockDuration: 5 * 60 * 1000 },
);

aiPageWorker.on("failed", (job, error) => {
  console.error(`AI page ${job?.id} failed:`, error);
});

/**
 * GEO runs on its own queue rather than sharing the AI one.
 *
 * `ai-page` serves a single-page suggestion someone is waiting on: short lock,
 * concurrency 2. A GEO audit walks the whole crawl, so sharing would park an
 * interactive request behind a multi-minute batch.
 */
const geoWorker = new Worker<GeoAuditJob>(
  GEO_QUEUE,
  async (job) => {
    if (job.name === GEO_AUDIT_JOB) {
      const payload = job.data;
      console.log(`GEO ${job.id}: ${payload.projectId} (${payload.mode}, ${payload.trigger})`);
      await runGeoAuditJob(payload);
      console.log(`GEO ${job.id}: done`);
      return;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection, concurrency: 1, lockDuration: 30 * 60 * 1000 },
);

geoWorker.on("failed", (job, error) => {
  console.error(`GEO ${job?.id} failed:`, error);
});

console.log(
  `Worker listening on ${CRAWL_QUEUE}, ${COMPETITOR_QUEUE}, ${AI_PAGE_QUEUE} and ${GEO_QUEUE} (${redisUrl})`,
);
