/**
 * Queue and job names, shared so the producer (web) and consumer (worker) can
 * never drift apart. They used to be duplicated string literals in both apps.
 */

export const CRAWL_QUEUE = "crawl-site";
export const CRAWL_HOMEPAGE_JOB = "crawl-homepage";
export const RUN_PERFORMANCE_JOB = "run-performance";

/**
 * Competitor work gets its own queue. The crawl queue runs at concurrency 1, so
 * a ten-minute discovery run there would stall every other user's crawl and
 * PageSpeed job behind it.
 */
export const COMPETITOR_QUEUE = "competitor-analysis";
export const COMPETITOR_DISCOVER_JOB = "competitor-discover";
export const COMPETITOR_ANALYZE_ONE_JOB = "competitor-analyze-one";
export const COMPETITOR_INSIGHTS_JOB = "competitor-insights";

/**
 * Crawls pages of the site's page inventory (SitePage): the ones chosen, or
 * its Priority pages when none are named. Pages are never discovered or
 * re-classified here; that is DISCOVER_SITE_JOB's work.
 */
export type CrawlHomepageJob = {
  projectId: string;
  /** Unused. Kept so jobs queued before crawls took targets still parse. */
  pageId?: string;
  url: string;
  /**
   * Page keys (pageKeyOf) of inventory pages to fetch. Omitted: the
   * inventory's Priority pages. The worker reads each page's tier itself.
   */
  targets?: string[];
  /** initial: the site's first crawl. recrawl: chosen pages. new-pages: pages a check just found. */
  scope?: "initial" | "recrawl" | "new-pages";
  /** The usage record this crawl was charged to; settled when it ends. */
  usageId?: string;
};

/**
 * Finds a site's pages and classifies them Priority or Standard, without
 * crawling them.
 *
 *   initial:   a new site. Every page found is classified and stored.
 *   new-pages: an existing site. Only pages not known yet are classified and
 *              added; known pages keep their classification.
 */
export const DISCOVER_SITE_JOB = "discover-site";

export type DiscoverSiteJob = {
  projectId: string;
  mode: "initial" | "new-pages";
};

/**
 * Fetches one page into the latest crawl, without touching the rest of the
 * site. Two uses:
 *
 *   priority-fetch: a Standard page the user made Priority, fetched in full now.
 *   recrawl:        "Crawl page": the page fetched again at its own tier,
 *                   to check a change made to it.
 */
export const CRAWL_PAGE_JOB = "crawl-page";

export type CrawlPageJob = {
  projectId: string;
  pageId: string;
  /** The page's path. */
  path: string;
  /** Defaults to priority-fetch, which is what jobs queued before modes were. */
  mode?: "priority-fetch" | "recrawl";
  /** The usage record a "Crawl page" was charged to; settled when it ends. */
  usageId?: string;
};

export type PerfPageTarget = {
  pageId: string;
  url: string;
};

export type RunPerformanceJob = {
  projectId: string;
  pages: PerfPageTarget[];
};

export type CompetitorDiscoverJob = {
  projectId: string;
  mode: "full" | "refresh";
};

export type CompetitorAnalyzeOneJob = {
  projectId: string;
  competitorId: string;
};

export type CompetitorInsightsJob = {
  projectId: string;
};

/** The nine phases the discovery orchestrator reports through. */
export const COMPETITOR_PHASES = [
  "queries",
  "serp",
  "candidates",
  "classify",
  "crawl",
  "score",
  "gaps",
  "opportunities",
  "summary",
] as const;

export type CompetitorPhase = (typeof COMPETITOR_PHASES)[number];

export const COMPETITOR_PHASE_LABELS: Record<CompetitorPhase, string> = {
  queries: "Generating search queries",
  serp: "Searching the results pages",
  candidates: "Collecting candidate domains",
  classify: "Classifying domains",
  crawl: "Crawling competitor sites",
  score: "Scoring competitors",
  gaps: "Finding content gaps",
  opportunities: "Prioritizing opportunities",
  summary: "Writing the summary",
};

/**
 * AI work gets its own queues (Phase 1.9).
 *
 * Three rather than one: a site-wide analysis over hundreds of pages must not
 * sit in front of a single-page regeneration a user is waiting on, and neither
 * may block the crawler. AI never shares the crawl queue.
 */
export const AI_PAGE_QUEUE = "ai-page";
export const AI_SITE_QUEUE = "ai-site";
export const AI_COMPETITOR_QUEUE = "ai-competitor";

export const AI_PAGE_ANALYZE_JOB = "ai-page-analyze";
export const AI_SITE_ANALYZE_JOB = "ai-site-analyze";
export const AI_COMPETITOR_INSIGHT_JOB = "ai-competitor-insight";

/** Features the page queue can run. Mirrors AiFeature in @seo-maker/ai. */
export const AI_PAGE_FEATURES = [
  "page-recommendation",
  "title",
  "meta",
  "heading",
  "content",
  "schema",
  "internal-link",
  "image-alt",
] as const;

export type AiPageFeature = (typeof AI_PAGE_FEATURES)[number];

export type AiPageAnalyzeJob = {
  projectId: string;
  pageId: string;
  /**
   * Features the user asked for. Omit to explain the failing checks and write
   * a fix for each one the fix plan routes to AI ("Analyze this page").
   */
  features?: AiPageFeature[];
  mode: "quick" | "deep";
  /** Bypass the cached result and regenerate. */
  force?: boolean;
  /** The usage record this generation was charged to; settled when it ends. */
  usageId?: string;
};

/**
 * Redis key holding when a user last asked to stop a project's AI work, in
 * epoch milliseconds. A running job stops when the request is newer than the
 * job itself, so work queued after the stop still runs. Crawls and PageSpeed
 * carry their stop request on their own database rows instead; AI jobs have no
 * row of their own until they finish.
 */
export function aiStopKey(projectId: string): string {
  return `seo-maker:ai-stop:${projectId}`;
}

/** opportunities: AI wording for the site opportunities. strategy: Site Strategy. */
export type AiSiteTask = "opportunities" | "strategy";

export type AiSiteAnalyzeJob = {
  projectId: string;
  crawlId?: string;
  mode: "quick" | "deep";
  force?: boolean;
  /** Defaults to "opportunities", which is what jobs queued before tasks were. */
  task?: AiSiteTask;
  usageId?: string;
};

export type AiCompetitorInsightJob = {
  projectId: string;
  competitorId?: string;
  mode: "quick" | "deep";
  force?: boolean;
  usageId?: string;
};
