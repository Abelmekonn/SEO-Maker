import {
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_DISCOVER_JOB,
  COMPETITOR_INSIGHTS_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_QUEUE,
  RUN_PERFORMANCE_JOB,
  type CompetitorAnalyzeOneJob,
  type CompetitorDiscoverJob,
  type CompetitorInsightsJob,
  type CrawlHomepageJob,
  type PerfPageTarget,
  type RunPerformanceJob,
} from "@seo-maker/core/queue";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export {
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_DISCOVER_JOB,
  COMPETITOR_INSIGHTS_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_QUEUE,
  RUN_PERFORMANCE_JOB,
};
export type {
  CompetitorAnalyzeOneJob,
  CompetitorDiscoverJob,
  CompetitorInsightsJob,
  CrawlHomepageJob,
  PerfPageTarget,
  RunPerformanceJob,
};

type CrawlQueueJob = CrawlHomepageJob | RunPerformanceJob;
type CompetitorQueueJob = CompetitorDiscoverJob | CompetitorAnalyzeOneJob | CompetitorInsightsJob;

const JOB_OPTIONS = { attempts: 2, removeOnComplete: 50, removeOnFail: 50 } as const;

function redisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:6380";
}

let connection: IORedis | null = null;

/** One Redis connection shared by both queues. */
function getConnection() {
  if (!connection) {
    connection = new IORedis(redisUrl(), { maxRetriesPerRequest: null });
  }
  return connection;
}

let crawlQueue: Queue<CrawlQueueJob> | null = null;

function getCrawlQueue() {
  if (!crawlQueue) {
    crawlQueue = new Queue<CrawlQueueJob>(CRAWL_QUEUE, { connection: getConnection() });
  }
  return crawlQueue;
}

let competitorQueue: Queue<CompetitorQueueJob> | null = null;

function getCompetitorQueue() {
  if (!competitorQueue) {
    competitorQueue = new Queue<CompetitorQueueJob>(COMPETITOR_QUEUE, {
      connection: getConnection(),
    });
  }
  return competitorQueue;
}

export async function enqueueHomepageCrawl(data: CrawlHomepageJob) {
  await getCrawlQueue().add(CRAWL_HOMEPAGE_JOB, data, JOB_OPTIONS);
}

export async function enqueuePerformanceAudit(data: RunPerformanceJob) {
  await getCrawlQueue().add(RUN_PERFORMANCE_JOB, data, JOB_OPTIONS);
}

/**
 * Discovery runs once, never retried automatically: it is long, side-effectful
 * and spends real SERP/AI credits, so a silent BullMQ retry would double-bill.
 * Retries live inside the individual phases instead.
 */
export async function enqueueCompetitorDiscover(data: CompetitorDiscoverJob) {
  await getCompetitorQueue().add(COMPETITOR_DISCOVER_JOB, data, {
    attempts: 1,
    removeOnComplete: 20,
    removeOnFail: 20,
  });
}

export async function enqueueCompetitorAnalyzeOne(data: CompetitorAnalyzeOneJob) {
  await getCompetitorQueue().add(COMPETITOR_ANALYZE_ONE_JOB, data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 50,
    removeOnFail: 50,
  });
}

export async function enqueueCompetitorInsights(data: CompetitorInsightsJob) {
  await getCompetitorQueue().add(COMPETITOR_INSIGHTS_JOB, data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 20,
    removeOnFail: 20,
  });
}
