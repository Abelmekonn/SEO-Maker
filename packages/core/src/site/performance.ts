/**
 * Performance summary (Phase 3.7).
 *
 * A PageSpeed run stores the full Lighthouse result, which is far too large to
 * send to a model and mostly irrelevant to a site-level decision. This reduces
 * the newest run per page and device to the handful of numbers that matter:
 * score, Core Web Vitals bands, and which audits cost the most across pages.
 *
 * Thresholds are the published Core Web Vitals boundaries (web.dev). TBT is a
 * lab proxy for responsiveness, since a lab run rarely has field INP.
 */

export type PerformanceRunInput = {
  pageKey: string;
  strategy: string;
  performance: number | null;
  /** Seconds, as the worker stores it. */
  lcp: number | null;
  cls: number | null;
  /** Milliseconds. */
  tbt: number | null;
  /** Milliseconds. */
  inp: number | null;
  /** Lighthouse opportunities as stored: [{ id, title, savingsMs }]. */
  opportunities: unknown;
  createdAt: Date;
};

export type MetricBand = "good" | "needs-improvement" | "poor";

export type MetricTally = {
  measured: number;
  good: number;
  needsImprovement: number;
  poor: number;
  /** Page keys in the poor band, worst first. */
  poorPages: string[];
  /** Page keys needing improvement. */
  needsImprovementPages: string[];
};

export type StrategySummary = {
  pages: number;
  medianScore: number | null;
  /** Pages scoring below 50, the band Lighthouse colours red. */
  lowScorePages: string[];
  lcp: MetricTally;
  cls: MetricTally;
  tbt: MetricTally;
};

export type AuditSummary = {
  id: string;
  title: string;
  pages: number;
  totalSavingsMs: number;
  pageKeys: string[];
};

export type PerformanceSummary = {
  pagesMeasured: number;
  mobile: StrategySummary | null;
  desktop: StrategySummary | null;
  /** Lighthouse opportunities across pages, mobile first, by total savings. */
  topAudits: AuditSummary[];
};

/** [good ceiling, poor floor] for each metric, in the units stored. */
export const CWV_THRESHOLDS = {
  lcp: [2.5, 4],
  cls: [0.1, 0.25],
  tbt: [200, 600],
  inp: [200, 500],
} as const;

export function metricBand(metric: keyof typeof CWV_THRESHOLDS, value: number): MetricBand {
  const [good, poor] = CWV_THRESHOLDS[metric];
  if (value <= good) return "good";
  if (value > poor) return "poor";
  return "needs-improvement";
}

function latestPerPage(runs: PerformanceRunInput[], strategy: string): PerformanceRunInput[] {
  const newest = new Map<string, PerformanceRunInput>();
  for (const run of runs) {
    if (run.strategy !== strategy) continue;
    const seen = newest.get(run.pageKey);
    if (!seen || run.createdAt > seen.createdAt) newest.set(run.pageKey, run);
  }
  return [...newest.values()];
}

function tally(runs: PerformanceRunInput[], metric: "lcp" | "cls" | "tbt"): MetricTally {
  const result: MetricTally = {
    measured: 0,
    good: 0,
    needsImprovement: 0,
    poor: 0,
    poorPages: [],
    needsImprovementPages: [],
  };
  const measured = runs
    .filter((run) => run[metric] != null)
    .sort((a, b) => (b[metric] as number) - (a[metric] as number));
  for (const run of measured) {
    result.measured += 1;
    const band = metricBand(metric, run[metric] as number);
    if (band === "good") result.good += 1;
    if (band === "needs-improvement") {
      result.needsImprovement += 1;
      result.needsImprovementPages.push(run.pageKey);
    }
    if (band === "poor") {
      result.poor += 1;
      result.poorPages.push(run.pageKey);
    }
  }
  return result;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function summarizeStrategy(runs: PerformanceRunInput[]): StrategySummary | null {
  if (runs.length === 0) return null;
  const scored = runs.filter((run) => run.performance != null);
  return {
    pages: runs.length,
    medianScore: median(scored.map((run) => run.performance as number)),
    lowScorePages: scored
      .filter((run) => (run.performance as number) < 50)
      .sort((a, b) => (a.performance as number) - (b.performance as number))
      .map((run) => run.pageKey),
    lcp: tally(runs, "lcp"),
    cls: tally(runs, "cls"),
    tbt: tally(runs, "tbt"),
  };
}

type StoredOpportunity = { id?: unknown; title?: unknown; savingsMs?: unknown };

function readOpportunities(value: unknown): Array<{ id: string; title: string; savingsMs: number }> {
  if (!Array.isArray(value)) return [];
  return (value as StoredOpportunity[]).flatMap((item) =>
    typeof item?.id === "string" && typeof item.title === "string"
      ? [{ id: item.id, title: item.title, savingsMs: Number(item.savingsMs) || 0 }]
      : [],
  );
}

function aggregateAudits(runs: PerformanceRunInput[]): AuditSummary[] {
  const byId = new Map<string, AuditSummary>();
  for (const run of runs) {
    for (const audit of readOpportunities(run.opportunities)) {
      if (audit.savingsMs <= 0) continue;
      const entry = byId.get(audit.id) ?? {
        id: audit.id,
        title: audit.title,
        pages: 0,
        totalSavingsMs: 0,
        pageKeys: [],
      };
      entry.pages += 1;
      entry.totalSavingsMs += audit.savingsMs;
      entry.pageKeys.push(run.pageKey);
      byId.set(audit.id, entry);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.totalSavingsMs - a.totalSavingsMs || b.pages - a.pages || a.id.localeCompare(b.id))
    .slice(0, 8);
}

/** Returns null when PageSpeed has never run on this site. */
export function summarizePerformance(runs: PerformanceRunInput[]): PerformanceSummary | null {
  const mobileRuns = latestPerPage(runs, "mobile");
  const desktopRuns = latestPerPage(runs, "desktop");
  const pages = new Set([...mobileRuns, ...desktopRuns].map((run) => run.pageKey));
  if (pages.size === 0) return null;

  // Mobile is what Google indexes with, so its audits lead when both exist.
  const auditSource = mobileRuns.length > 0 ? mobileRuns : desktopRuns;
  return {
    pagesMeasured: pages.size,
    mobile: summarizeStrategy(mobileRuns),
    desktop: summarizeStrategy(desktopRuns),
    topAudits: aggregateAudits(auditSource),
  };
}
