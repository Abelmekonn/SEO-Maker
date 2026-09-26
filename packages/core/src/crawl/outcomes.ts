/**
 * Recommendation outcomes across crawls (Phase 4.7).
 *
 * The product loop ends in "Re-crawl -> Measure improvement". This measures the
 * only thing a crawl can measure: whether the SEO condition a recommendation
 * was about is still present. It says nothing about rankings or traffic, and
 * nothing here may be worded as if it did, because SEO Maker has no ranking
 * data for the site.
 *
 * A page that was not fetched again is "not re-checked", never "fixed": a
 * missing observation is not evidence that the problem went away.
 */

export type IssueSnapshot = { pageKey: string; checkId: string; severity: string };

export type CheckDelta = {
  checkId: string;
  fixed: number;
  introduced: number;
  persisting: number;
};

export type IssueDiff = {
  /** Pages fetched in both crawls. Only these can be compared. */
  comparablePages: number;
  pagesOnlyBefore: number;
  pagesOnlyAfter: number;
  fixed: IssueSnapshot[];
  introduced: IssueSnapshot[];
  persisting: IssueSnapshot[];
  byCheck: CheckDelta[];
};

const pair = (issue: { pageKey: string; checkId: string }) => `${issue.pageKey}\u0000${issue.checkId}`;

/** Issue-level diff between two crawls, over the pages both of them fetched. */
export function diffIssues(input: {
  beforePages: Iterable<string>;
  afterPages: Iterable<string>;
  before: IssueSnapshot[];
  after: IssueSnapshot[];
}): IssueDiff {
  const beforePages = new Set(input.beforePages);
  const afterPages = new Set(input.afterPages);
  const both = new Set([...beforePages].filter((key) => afterPages.has(key)));

  const before = input.before.filter((issue) => both.has(issue.pageKey));
  const after = input.after.filter((issue) => both.has(issue.pageKey));
  const beforeSet = new Set(before.map(pair));
  const afterSet = new Set(after.map(pair));

  const fixed = before.filter((issue) => !afterSet.has(pair(issue)));
  const persisting = after.filter((issue) => beforeSet.has(pair(issue)));
  const introduced = after.filter((issue) => !beforeSet.has(pair(issue)));

  const checks = new Map<string, CheckDelta>();
  const bump = (checkId: string, field: "fixed" | "introduced" | "persisting") => {
    const row = checks.get(checkId) ?? { checkId, fixed: 0, introduced: 0, persisting: 0 };
    row[field] += 1;
    checks.set(checkId, row);
  };
  for (const issue of fixed) bump(issue.checkId, "fixed");
  for (const issue of introduced) bump(issue.checkId, "introduced");
  for (const issue of persisting) bump(issue.checkId, "persisting");

  return {
    comparablePages: both.size,
    pagesOnlyBefore: [...beforePages].filter((key) => !both.has(key)).length,
    pagesOnlyAfter: [...afterPages].filter((key) => !both.has(key)).length,
    fixed,
    introduced,
    persisting,
    byCheck: [...checks.values()].sort(
      (a, b) => b.fixed + b.introduced + b.persisting - (a.fixed + a.introduced + a.persisting) || a.checkId.localeCompare(b.checkId),
    ),
  };
}

export type RecommendationRecord = {
  pageKey: string;
  checkId: string;
  recommendedAt: Date;
};

export type RecommendationOutcome = RecommendationRecord & {
  /**
   * resolved: the latest crawl fetched the page and the check now passes.
   * persists: the latest crawl fetched the page and the check still fails.
   * not-rechecked: the latest crawl did not fetch the page.
   * awaiting-recrawl: recommended after the latest crawl ran.
   */
  outcome: "resolved" | "persists" | "not-rechecked" | "awaiting-recrawl";
};

export function recommendationOutcomes(
  records: RecommendationRecord[],
  latest: { startedAt: Date; pages: Iterable<string>; failing: IssueSnapshot[] },
): RecommendationOutcome[] {
  const pages = new Set(latest.pages);
  const failing = new Set(latest.failing.map(pair));
  return records.map((record) => {
    if (record.recommendedAt >= latest.startedAt) return { ...record, outcome: "awaiting-recrawl" };
    if (!pages.has(record.pageKey)) return { ...record, outcome: "not-rechecked" };
    return { ...record, outcome: failing.has(pair(record)) ? "persists" : "resolved" };
  });
}

export type OpportunityOutcome = "new" | "resolved" | "improved" | "unchanged" | "worse";

/**
 * How a site opportunity's condition moved since it was first found. Counts
 * are pages (or entries) affected, straight from the crawls that saw them.
 */
export function opportunityOutcome(input: {
  baselineCount: number | null;
  affectedCount: number;
  resolvedAt: Date | null;
  /** True when the crawl that first found it is the latest one: nothing to compare yet. */
  firstSeenInLatestCrawl: boolean;
}): OpportunityOutcome {
  if (input.resolvedAt) return "resolved";
  if (input.firstSeenInLatestCrawl || input.baselineCount == null) return "new";
  if (input.affectedCount < input.baselineCount) return "improved";
  if (input.affectedCount > input.baselineCount) return "worse";
  return "unchanged";
}
