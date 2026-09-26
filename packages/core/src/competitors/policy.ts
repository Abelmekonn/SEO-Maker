/**
 * How much competitor work is done, and how often it is redone.
 *
 * One place, so the crawler, the discovery run and the screens agree. Each
 * value can be overridden in the worker's environment.
 */

export type CompetitorPolicy = {
  /** A competitor crawled more recently than this is reused, never re-crawled. */
  crawlTtlHours: number;
  /** A search checked more recently than this is not fetched again. */
  serpTtlHours: number;
  /** Pages crawled per competitor. */
  pageLimit: number;
  /** Results read per search. */
  serpDepth: number;
};

export const COMPETITOR_POLICY: CompetitorPolicy = {
  crawlTtlHours: 168,
  serpTtlHours: 72,
  pageLimit: 8,
  serpDepth: 20,
};

function envNumber(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const value = Number(env[name]);
  return Number.isFinite(value) && value >= min ? Math.min(max, Math.round(value)) : fallback;
}

/**
 *   COMPETITOR_CRAWL_TTL_HOURS  default 168 (a week)
 *   SERP_TTL_HOURS              default 72
 *   COMPETITOR_PAGE_LIMIT       default 8, between 3 and 15
 */
export function competitorPolicy(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): CompetitorPolicy {
  return {
    crawlTtlHours: envNumber(env, "COMPETITOR_CRAWL_TTL_HOURS", COMPETITOR_POLICY.crawlTtlHours, 1, 24 * 90),
    serpTtlHours: envNumber(env, "SERP_TTL_HOURS", COMPETITOR_POLICY.serpTtlHours, 1, 24 * 30),
    pageLimit: envNumber(env, "COMPETITOR_PAGE_LIMIT", COMPETITOR_POLICY.pageLimit, 3, 15),
    serpDepth: COMPETITOR_POLICY.serpDepth,
  };
}

/** Whether something done at `at` is still within `ttlHours` of `now`. */
export function isFresh(at: Date | string | null | undefined, ttlHours: number, now: Date = new Date()): boolean {
  if (!at) return false;
  const time = new Date(at).getTime();
  return Number.isFinite(time) && now.getTime() - time < ttlHours * 60 * 60 * 1000;
}
