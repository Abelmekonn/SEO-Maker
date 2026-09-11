import { Queue } from "bullmq";
import IORedis from "ioredis";

export const CRAWL_QUEUE = "crawl-site";
export const CRAWL_HOMEPAGE_JOB = "crawl-homepage";
export const RUN_PERFORMANCE_JOB = "run-performance";

export type CrawlHomepageJob = {
  projectId: string;
  pageId: string;
  url: string;
};

export type PerfPageTarget = {
  pageId: string;
  url: string;
};

export type RunPerformanceJob = {
  projectId: string;
  pages: PerfPageTarget[];
};

type QueueJob = CrawlHomepageJob | RunPerformanceJob;

function redisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:6380";
}

let crawlQueue: Queue<QueueJob> | null = null;

function getCrawlQueue() {
  if (!crawlQueue) {
    crawlQueue = new Queue<QueueJob>(CRAWL_QUEUE, {
      connection: new IORedis(redisUrl(), { maxRetriesPerRequest: null }),
    });
  }
  return crawlQueue;
}

export async function enqueueHomepageCrawl(data: CrawlHomepageJob) {
  await getCrawlQueue().add(CRAWL_HOMEPAGE_JOB, data, {
    attempts: 2,
    removeOnComplete: 50,
    removeOnFail: 50,
  });
}

export async function enqueuePerformanceAudit(data: RunPerformanceJob) {
  await getCrawlQueue().add(RUN_PERFORMANCE_JOB, data, {
    attempts: 2,
    removeOnComplete: 50,
    removeOnFail: 50,
  });
}
