/**
 * What each plan includes.
 *
 * Lives in core because two processes enforce it: the web app, when a request
 * arrives, and the crawl and AI workers, which read the owner's plan when a job
 * runs. A job can wait in the queue while the plan changes, and a request body
 * is not an access control, so a worker never takes these numbers from the job.
 */

export type PlanId = "free" | "pro" | "agency";

export type PlanLimits = {
  label: string;
  maxProjects: number;
  /** Pages fetched per crawl, Priority and Standard together. */
  maxPages: number;
  maxCompetitors: number;
  /**
   * Page AI: analysis and recommendations for one page. Always started by the
   * user, never by a crawl.
   */
  ai: boolean;
  /** Site AI: site-level strategy and opportunity explanations. */
  siteAi: boolean;
  /** Competitor AI: comparison with collected competitor evidence. */
  competitorAi: boolean;
  /** Page AI only for the site's homepage. */
  aiHomepageOnly: boolean;
  /**
   * AI generations a user may start per rolling 24 hours and 7 days. A
   * generation is one user-initiated request ("analyze this page", "generate
   * metadata"), however many model calls it takes. Null means no per-user cap;
   * the system-wide provider budget still applies.
   */
  aiDailyLimit: number | null;
  aiWeeklyLimit: number | null;
  /** Deep Analysis: business context that makes recommendations specific. */
  deepMode: boolean;
  /**
   * Pages per crawl that get a Priority Crawl: the full page content (text,
   * headings, links, images, structured data) Page Intelligence and AI need.
   * Which pages qualify is decided by importance, not by this number; the
   * number only caps it, so a site with two important pages gets two.
   */
  priorityPages: number;
  /**
   * Whether Standard Crawl pages are analyzed too. On a plan that analyzes
   * Priority pages only, the rest of the crawl maps the site without being
   * audited.
   */
  analyzeStandardPages: boolean;
  /** PageSpeed runs. Free runs them on the homepage only. */
  performance: boolean;
  /**
   * Re-crawls allowed per site after its first crawl. Counted per site and
   * user in the usage ledger, so deleting and re-adding a site does not reset
   * it. Null means unlimited.
   */
  recrawlsPerSite: number | null;
};

export const planLimits: Record<PlanId, PlanLimits> = {
  /**
   * Free is the real product on one page: the homepage gets the full crawl,
   * every check, performance, Deep Analysis and Page AI, so there is something
   * genuine to upgrade from. What it lacks is breadth (one page, one re-crawl)
   * and the site- and competitor-level AI that only make sense across pages.
   */
  free: {
    label: "Free",
    maxProjects: 1,
    maxPages: 1,
    maxCompetitors: 0,
    ai: true,
    siteAi: false,
    competitorAi: false,
    aiHomepageOnly: true,
    aiDailyLimit: 2,
    aiWeeklyLimit: 10,
    deepMode: true,
    priorityPages: 1,
    analyzeStandardPages: false,
    performance: true,
    recrawlsPerSite: 1,
  },
  pro: {
    label: "Pro",
    maxProjects: 1,
    maxPages: 10,
    maxCompetitors: 5,
    ai: true,
    siteAi: true,
    competitorAi: true,
    aiHomepageOnly: false,
    aiDailyLimit: null,
    aiWeeklyLimit: null,
    deepMode: true,
    priorityPages: 10,
    analyzeStandardPages: true,
    performance: true,
    recrawlsPerSite: null,
  },
  /**
   * Agency crawls 100 pages but keeps at most 25 of them Priority. Priority
   * pages store their full text and are what AI grounds on; a site rarely has
   * more than a couple of dozen pages that matter that much, and the cap keeps
   * a crawl's stored content and any AI context bounded. The rest still get a
   * Standard Crawl and every deterministic check.
   */
  agency: {
    label: "Agency",
    maxProjects: 100,
    maxPages: 100,
    maxCompetitors: 25,
    ai: true,
    siteAi: true,
    competitorAi: true,
    aiHomepageOnly: false,
    aiDailyLimit: null,
    aiWeeklyLimit: null,
    deepMode: true,
    priorityPages: 25,
    analyzeStandardPages: true,
    performance: true,
    recrawlsPerSite: null,
  },
};

export function isPlanId(value: string): value is PlanId {
  return value === "free" || value === "pro" || value === "agency";
}

/** A stored plan value, with anything unrecognised read as Free. */
export function planIdOf(value: string | null | undefined): PlanId {
  return value && isPlanId(value) ? value : "free";
}

/** The three AI capabilities. Each is started by the user, never by a crawl. */
export type AiCapability = "page" | "site" | "competitor";

/** Whether a plan includes an AI capability at all. Quotas are checked separately. */
export function planAllowsAi(limits: PlanLimits, capability: AiCapability): boolean {
  switch (capability) {
    case "page":
      return limits.ai;
    case "site":
      return limits.siteAi;
    case "competitor":
      return limits.competitorAi;
  }
}

/** Crawls a site may have in total on a plan: the first one plus its re-crawls. Null is unlimited. */
export function crawlsPerSite(limits: PlanLimits): number | null {
  return limits.recrawlsPerSite == null ? null : 1 + limits.recrawlsPerSite;
}
