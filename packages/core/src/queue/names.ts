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
  /** Omit to run the default set for the page's failing checks. */
  features?: AiPageFeature[];
  mode: "quick" | "deep";
  /** Bypass the cached result and regenerate. */
  force?: boolean;
};

export type AiSiteAnalyzeJob = {
  projectId: string;
  crawlId?: string;
  mode: "quick" | "deep";
  force?: boolean;
};

export type AiCompetitorInsightJob = {
  projectId: string;
  competitorId?: string;
  mode: "quick" | "deep";
  force?: boolean;
};
