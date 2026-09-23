import type { PerformanceAudit } from "@seo-maker/db";

export type Rating = "good" | "warn" | "bad" | "none";

/** PageSpeed states with a job still on the worker. "cancelling" is a stop in progress. */
export const PERF_ACTIVE = new Set(["queued", "running", "cancelling"]);

export function latestStrategy(
  audits: PerformanceAudit[],
  pageId: string,
  strategy: "mobile" | "desktop",
) {
  return (
    audits.find((audit) => audit.pageId === pageId && audit.strategy === strategy) ?? null
  );
}

export function scoreRating(score: number | null | undefined): Rating {
  if (score == null) return "none";
  if (score >= 90) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

type VitalDef = {
  id: "lcp" | "fcp" | "cls" | "inp" | "tbt";
  label: string;
  name: string;
  good: number;
  poor: number;
  format: (value: number) => string;
};

export const vitals: VitalDef[] = [
  { id: "lcp", label: "LCP", name: "Largest Contentful Paint", good: 2.5, poor: 4, format: (v) => `${v.toFixed(1)} s` },
  { id: "inp", label: "INP", name: "Interaction to Next Paint", good: 200, poor: 500, format: (v) => `${Math.round(v)} ms` },
  { id: "cls", label: "CLS", name: "Cumulative Layout Shift", good: 0.1, poor: 0.25, format: (v) => v.toFixed(2) },
  { id: "fcp", label: "FCP", name: "First Contentful Paint", good: 1.8, poor: 3, format: (v) => `${v.toFixed(1)} s` },
  { id: "tbt", label: "TBT", name: "Total Blocking Time", good: 200, poor: 600, format: (v) => `${Math.round(v)} ms` },
];

export function vitalRating(def: VitalDef, value: number | null | undefined): Rating {
  if (value == null) return "none";
  if (value <= def.good) return "good";
  if (value <= def.poor) return "warn";
  return "bad";
}

export function vitalValue(audit: PerformanceAudit, def: VitalDef) {
  return audit[def.id];
}

export type Opportunity = {
  id: string;
  title: string;
  savingsMs: number;
  savingsBytes?: number;
  description?: string;
  displayValue?: string;
};
export type Diagnostic = { id: string; title: string; value: string };
export type OpportunityPriority = "high" | "medium" | "low";

export function readOpportunities(value: unknown): Opportunity[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Opportunity =>
      typeof item?.id === "string" &&
      typeof item?.title === "string" &&
      typeof item?.savingsMs === "number",
  );
}

export function opportunityPriority(item: Opportunity): OpportunityPriority {
  const bytes = item.savingsBytes ?? 0;
  if (item.savingsMs >= 400 || bytes >= 200_000) return "high";
  if (item.savingsMs >= 150 || bytes >= 50_000) return "medium";
  return "low";
}

export function scoreBand(score: number | null | undefined) {
  if (score == null) return { rating: "none" as Rating, label: "No data" };
  if (score >= 100) return { rating: "good" as Rating, label: "Excellent" };
  if (score >= 90) return { rating: "good" as Rating, label: "Good" };
  if (score >= 50) return { rating: "warn" as Rating, label: "Needs work" };
  return { rating: "bad" as Rating, label: "Poor" };
}

export function extraMetrics(rawData: unknown) {
  const metrics =
    rawData && typeof rawData === "object" && "metrics" in rawData
      ? (rawData as { metrics?: { ttfb?: unknown; speedIndex?: unknown } }).metrics
      : null;
  return {
    ttfb: typeof metrics?.ttfb === "number" ? metrics.ttfb : null,
    speedIndex: typeof metrics?.speedIndex === "number" ? metrics.speedIndex : null,
  };
}

export function formatRelativeRun(date: Date | null | undefined) {
  if (!date) return "No run yet";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function readDiagnostics(value: unknown): Diagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Diagnostic =>
      typeof item?.id === "string" && typeof item?.title === "string",
  );
}

export function formatSavings(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${Math.round(bytes)} B`;
}
