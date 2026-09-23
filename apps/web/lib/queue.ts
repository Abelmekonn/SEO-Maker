import {
  AI_PAGE_ANALYZE_JOB,
  AI_PAGE_QUEUE,
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_DISCOVER_JOB,
  COMPETITOR_INSIGHTS_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_QUEUE,
  RUN_PERFORMANCE_JOB,
  type AiPageAnalyzeJob,
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
  AI_PAGE_ANALYZE_JOB,
  AI_PAGE_QUEUE,
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_DISCOVER_JOB,
  COMPETITOR_INSIGHTS_JOB,
  COMPETITOR_QUEUE,
  CRAWL_HOMEPAGE_JOB,
  CRAWL_QUEUE,
  RUN_PERFORMANCE_JOB,
};
export type {
  AiPageAnalyzeJob,
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

let aiPageQueue: Queue<AiPageAnalyzeJob> | null = null;

function getAiPageQueue() {
  if (!aiPageQueue) {
    aiPageQueue = new Queue<AiPageAnalyzeJob>(AI_PAGE_QUEUE, { connection: getConnection() });
  }
  return aiPageQueue;
}

/**
 * Queues page analysis on the AI queue (Phase 1.9).
 *
 * `attempts: 1` on purpose. The AI layer already retries retryable provider
 * failures internally and records the outcome as an AiResult row, so a BullMQ
 * retry on top would re-run the whole job — and spend tokens again — for a
 * failure that has already been handled and reported.
 */
export async function enqueueAiPageAnalysis(data: AiPageAnalyzeJob) {
  await getAiPageQueue().add(AI_PAGE_ANALYZE_JOB, data, {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
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

export type AiQueueJob = {
  jobId: string;
  pageId: string;
  state: "active" | "waiting";
  features: string[] | null;
  /** 1-based place in the whole AI queue, across projects. Active jobs are 0. */
  position: number;
};

/**
 * This project's AI jobs that have not finished, in the order the worker will
 * take them. The queue is shared across projects, so a job's position counts
 * everyone's waiting work ahead of it: that is the honest wait.
 */
export async function getAiQueueJobs(projectId: string): Promise<AiQueueJob[]> {
  const queue = getAiPageQueue();
  const [active, waiting] = await Promise.all([
    queue.getJobs(["active"]),
    queue.getJobs(["waiting", "prioritized", "delayed"], 0, 999, true),
  ]);

  const jobs: AiQueueJob[] = [];
  for (const job of active) {
    if (job?.data?.projectId === projectId) {
      jobs.push({ jobId: String(job.id), pageId: job.data.pageId, state: "active", features: job.data.features ?? null, position: 0 });
    }
  }
  waiting.forEach((job, index) => {
    if (job?.data?.projectId === projectId) {
      jobs.push({
        jobId: String(job.id),
        pageId: job.data.pageId,
        state: "waiting",
        features: job.data.features ?? null,
        position: index + 1,
      });
    }
  });
  return jobs;
}
