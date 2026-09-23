import {
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_DISCOVER_JOB,
  COMPETITOR_INSIGHTS_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_QUEUE,
  GEO_AUDIT_JOB,
  GEO_QUEUE,
  RUN_PERFORMANCE_JOB,
  type CompetitorAnalyzeOneJob,
  type CompetitorDiscoverJob,
  type CompetitorInsightsJob,
  type CrawlHomepageJob,
  type GeoAuditJob,
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
  GEO_AUDIT_JOB,
  GEO_QUEUE,
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

/** One Redis connection shared by every queue. */
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

let geoQueue: Queue<GeoAuditJob> | null = null;

function getGeoQueue() {
  if (!geoQueue) {
    geoQueue = new Queue<GeoAuditJob>(GEO_QUEUE, { connection: getConnection() });
  }
  return geoQueue;
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

/**
 * Enqueues a GEO audit.
 *
 * `attempts: 1` for the same reason competitor discovery uses it: the run is
 * long and, once the AI phases land, spends real tokens. A silent BullMQ retry
 * would double-bill. The jobId collapses a crawl-completion chain and a manual
 * click into one run rather than two writing the same project row.
 */
export async function enqueueGeoAudit(data: GeoAuditJob) {
  await getGeoQueue().add(GEO_AUDIT_JOB, data, {
    jobId: `geo:${data.projectId}:${data.crawlId ?? "latest"}`,
    attempts: 1,
    removeOnComplete: 20,
    removeOnFail: 20,
  });
}
