/**
 * Crawl comparison (PRD §24).
 *
 * The product loop is Fix -> Re-crawl -> Measure, and until now nothing could
 * measure: a re-crawl overwrote the previous state in place. With each run
 * stored as its own `Crawl`, the comparison is a straight diff of two
 * snapshots and needs no extra table.
 */

export type ComparableCrawl = {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  crawled: number;
  analyzed: number;
  failed: number;
  issueCount: number;
  seoScore: number | null;
  technicalScore: number | null;
  onPageScore: number | null;
};

export type CrawlDelta = {
  label: string;
  /** Null when the metric is unavailable in either run. */
  change: number | null;
  /** True when a rise is an improvement. */
  higherIsBetter: boolean;
  current: number | null;
  previous: number | null;
};

export type CrawlComparison = {
  current: ComparableCrawl;
  previous: ComparableCrawl;
  deltas: CrawlDelta[];
  /** True when nothing measurable moved between the two runs. */
  unchanged: boolean;
};

function delta(
  label: string,
  current: number | null,
  previous: number | null,
  higherIsBetter: boolean,
): CrawlDelta {
  const change =
    current == null || previous == null ? null : Math.round((current - previous) * 100) / 100;
  return { label, change, higherIsBetter, current, previous };
}

/**
 * Compares the newest finished crawl with the one before it.
 *
 * Returns null when there is no earlier run, which is the honest answer on a
 * first crawl rather than a comparison against zero.
 */
export function compareCrawls(crawls: ComparableCrawl[]): CrawlComparison | null {
  const finished = crawls
    .filter((crawl) => crawl.status === "completed" || crawl.status === "failed")
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const [current, previous] = finished;
  if (!current || !previous) {
    return null;
  }

  const deltas = [
    delta("SEO readiness", current.seoScore, previous.seoScore, true),
    delta("Technical SEO", current.technicalScore, previous.technicalScore, true),
    delta("On-page SEO", current.onPageScore, previous.onPageScore, true),
    delta("Issues", current.issueCount, previous.issueCount, false),
    delta("Pages analyzed", current.analyzed, previous.analyzed, true),
    delta("Failed pages", current.failed, previous.failed, false),
  ];

  return {
    current,
    previous,
    deltas,
    unchanged: deltas.every((item) => item.change === null || item.change === 0),
  };
}

/** True when a delta moved in the direction the user wants. */
export function isImprovement(item: CrawlDelta): boolean | null {
  if (item.change == null || item.change === 0) {
    return null;
  }
  return item.higherIsBetter ? item.change > 0 : item.change < 0;
}
