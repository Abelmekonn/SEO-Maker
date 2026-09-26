import {
  AI_COMPETITOR_INSIGHT_JOB,
  AI_COMPETITOR_QUEUE,
  AI_PAGE_ANALYZE_JOB,
  AI_PAGE_QUEUE,
  AI_SITE_ANALYZE_JOB,
  AI_SITE_QUEUE,
  COMPETITOR_ANALYZE_ONE_JOB,
  COMPETITOR_DISCOVER_JOB,
  COMPETITOR_INSIGHTS_JOB,
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
  type CompetitorInsightsJob,
  type CrawlHomepageJob,
  type CrawlPageJob,
  type DiscoverSiteJob,
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

type CrawlQueueJob = CrawlHomepageJob | RunPerformanceJob | CrawlPageJob | DiscoverSiteJob;
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

/**
 * Finds a site's pages and classifies them, without crawling them. Not
 * retried by BullMQ: a failure is recorded on the project and the user tries
 * again from the screen.
 */
export async function enqueueDiscovery(data: DiscoverSiteJob) {
  await getCrawlQueue().add(DISCOVER_SITE_JOB, data, { attempts: 1, removeOnComplete: 50, removeOnFail: 50 });
}

/**
 * One page fetched into the latest crawl: a Priority fetch, or "Crawl page".
 * Deduplicated by page: a second press while one waits reuses it. Not
 * retried by BullMQ; the user can press again.
 */
export async function enqueueCrawlPage(data: CrawlPageJob) {
  await getCrawlQueue().add(CRAWL_PAGE_JOB, data, {
    jobId: `crawl-page-${data.pageId}`,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  });
}

/** Page ids with a Priority fetch waiting or running for this project. */
export async function getCrawlPageJobs(projectId: string): Promise<string[]> {
  const jobs = await getCrawlQueue().getJobs(["active", "waiting", "prioritized", "delayed"], 0, 500);
  return jobs
    .filter((job) => job?.name === CRAWL_PAGE_JOB && job.data?.projectId === projectId)
    .map((job) => (job.data as CrawlPageJob).pageId);
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

let aiSiteQueue: Queue<AiSiteAnalyzeJob> | null = null;

function getAiSiteQueue() {
  if (!aiSiteQueue) {
    aiSiteQueue = new Queue<AiSiteAnalyzeJob>(AI_SITE_QUEUE, { connection: getConnection() });
  }
  return aiSiteQueue;
}

let aiCompetitorQueue: Queue<AiCompetitorInsightJob> | null = null;

function getAiCompetitorQueue() {
  if (!aiCompetitorQueue) {
    aiCompetitorQueue = new Queue<AiCompetitorInsightJob>(AI_COMPETITOR_QUEUE, { connection: getConnection() });
  }
  return aiCompetitorQueue;
}

/**
 * Queues site-level AI wording for the project's opportunities (Phase 3.3).
 * `attempts: 1` for the same reason as page analysis: the AI layer retries
 * provider failures itself and records the outcome.
 */
export async function enqueueAiSiteAnalysis(data: AiSiteAnalyzeJob) {
  await getAiSiteQueue().add(AI_SITE_ANALYZE_JOB, data, { attempts: 1, removeOnComplete: 50, removeOnFail: 50 });
}

/** Queues competitor interpretation (Phase 4.1), one competitor or all. */
export async function enqueueAiCompetitorInsight(data: AiCompetitorInsightJob) {
  await getAiCompetitorQueue().add(AI_COMPETITOR_INSIGHT_JOB, data, { attempts: 1, removeOnComplete: 50, removeOnFail: 50 });
}

export type ProjectJob<T> = { jobId: string; state: "active" | "waiting"; queuedAt: number; data: T };

async function projectJobs<T extends { projectId: string }>(queue: Queue<T>, projectId: string): Promise<ProjectJob<T>[]> {
  const [active, waiting] = await Promise.all([
    queue.getJobs(["active"]),
    queue.getJobs(["waiting", "prioritized", "delayed"], 0, 999, true),
  ]);
  return [
    ...active.map((job) => ({ job, state: "active" as const })),
    ...waiting.map((job) => ({ job, state: "waiting" as const })),
  ]
    .filter(({ job }) => job?.data?.projectId === projectId)
    .map(({ job, state }) => ({ jobId: String(job.id), state, queuedAt: job.timestamp, data: job.data as T }));
}

/** This project's site-level AI jobs that have not finished. */
export function getAiSiteJobs(projectId: string) {
  return projectJobs(getAiSiteQueue(), projectId);
}

/** This project's competitor AI jobs that have not finished. */
export function getAiCompetitorJobs(projectId: string) {
  return projectJobs(getAiCompetitorQueue(), projectId);
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
  /** When the job was queued, epoch ms. */
  queuedAt: number;
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
      jobs.push({
        jobId: String(job.id),
        pageId: job.data.pageId,
        state: "active",
        features: job.data.features ?? null,
        position: 0,
        queuedAt: job.timestamp,
      });
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
        queuedAt: job.timestamp,
      });
    }
  });
  return jobs;
}

/**
 * Whether a crawler worker is connected, and where this project's crawl job
 * waits. The Crawl button only queues a job; this is how the UI proves a worker
 * will actually pick it up instead of leaving it waiting forever.
 */
export async function getCrawlQueueState(projectId: string): Promise<{
  workerOnline: boolean;
  waitingPosition: number | null;
}> {
  const queue = getCrawlQueue();
  const [workers, waiting] = await Promise.all([
    queue.getWorkersCount(),
    queue.getJobs(["waiting", "prioritized", "delayed"], 0, 200, true),
  ]);
  // Crawls only: a discovery or one page waiting for this site is not its crawl.
  const index = waiting.findIndex(
    (job) => job?.name === CRAWL_HOMEPAGE_JOB && job.data && "projectId" in job.data && job.data.projectId === projectId,
  );
  return { workerOnline: workers > 0, waitingPosition: index === -1 ? null : index + 1 };
}

const NOT_STARTED = ["waiting", "prioritized", "delayed", "paused"] as const;

/** Removes jobs that have not started yet and match, from one queue. */
async function removeWaiting<T>(queue: Queue<T>, match: (name: string, data: T) => boolean): Promise<number> {
  return (await removeWaitingJobs(queue, match)).length;
}

/** The same, returning what was removed, so charges for them can be given back. */
async function removeWaitingJobs<T>(queue: Queue<T>, match: (name: string, data: T) => boolean): Promise<T[]> {
  const jobs = await queue.getJobs([...NOT_STARTED], 0, 999);
  const removed: T[] = [];
  for (const job of jobs) {
    if (job?.data && match(job.name, job.data)) {
      await job.remove().catch(() => undefined);
      removed.push(job.data);
    }
  }
  return removed;
}

/** Usage records of the AI jobs removed from the queue by a stop or a delete. */
async function removeWaitingWithUsage<T>(queue: Queue<T>, match: (name: string, data: T) => boolean): Promise<{ removed: number; usageIds: string[] }> {
  const jobs = await removeWaitingJobs(queue, match);
  const usageIds = jobs.flatMap((data) => {
    const usageId = (data as { usageId?: unknown }).usageId;
    return typeof usageId === "string" ? [usageId] : [];
  });
  return { removed: jobs.length, usageIds };
}

function forProject(projectId: string) {
  return (_name: string, data: unknown) =>
    typeof data === "object" && data !== null && "projectId" in data && data.projectId === projectId;
}

/**
 * Removes a project's jobs that have not started, from every queue, so a
 * deleted site is not crawled or analysed afterwards. A job already running
 * finds its project gone and stops on its own.
 */
export async function removeProjectJobs(projectId: string): Promise<{ removed: number; usageIds: string[] }> {
  const queues = [
    getCrawlQueue(),
    getCompetitorQueue(),
    getAiPageQueue(),
    getAiSiteQueue(),
    getAiCompetitorQueue(),
  ] as Queue<unknown>[];
  let removed = 0;
  const usageIds: string[] = [];
  for (const queue of queues) {
    const result = await removeWaitingWithUsage(queue, forProject(projectId));
    removed += result.removed;
    usageIds.push(...result.usageIds);
  }
  return { removed, usageIds };
}

/** Takes a queued crawl that has not started off the queue, with the usage records it held. */
export async function removeQueuedCrawl(projectId: string): Promise<{ removed: number; usageIds: string[] }> {
  const mine = forProject(projectId);
  return removeWaitingWithUsage(getCrawlQueue(), (name, data) => name === CRAWL_HOMEPAGE_JOB && mine(name, data));
}

/** Takes a queued PageSpeed run that has not started off the queue. */
export async function removeQueuedPerformance(projectId: string): Promise<number> {
  const mine = forProject(projectId);
  return removeWaiting(getCrawlQueue(), (name, data) => name === RUN_PERFORMANCE_JOB && mine(name, data));
}

/** When the user last pressed Stop on this project's AI work, epoch ms. */
export async function getAiStopAt(projectId: string): Promise<number | null> {
  const value = Number(await getConnection().get(aiStopKey(projectId)));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Whether the worker is running this project's PageSpeed job right now. */
export async function performanceJobActive(projectId: string): Promise<boolean> {
  const active = await getCrawlQueue().getJobs(["active"]);
  return active.some((job) => job?.name === RUN_PERFORMANCE_JOB && job.data?.projectId === projectId);
}

/**
 * Stops a project's AI work: pages waiting are taken off the queue, and the
 * page being analysed stops at its next check (the worker polls the stop key).
 * Work queued after this call is unaffected.
 */
export async function stopAiWork(projectId: string): Promise<{ removed: number; running: number; usageIds: string[] }> {
  const connection = getConnection();
  // An hour outlives any job queued before the stop.
  await connection.set(aiStopKey(projectId), String(Date.now()), "EX", 3600);
  // Page, site and competitor AI all read the same stop key.
  const queues = [getAiPageQueue(), getAiSiteQueue(), getAiCompetitorQueue()] as unknown as Queue<{ projectId: string }>[];
  let removed = 0;
  let running = 0;
  const usageIds: string[] = [];
  for (const queue of queues) {
    const result = await removeWaitingWithUsage(queue, forProject(projectId));
    removed += result.removed;
    usageIds.push(...result.usageIds);
    running += (await queue.getJobs(["active"])).filter((job) => job?.data?.projectId === projectId).length;
  }
  return { removed, running, usageIds };
}
