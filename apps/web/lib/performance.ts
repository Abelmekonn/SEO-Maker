import type { PerformanceAudit } from "@seo-maker/db";

export type Rating = "good" | "warn" | "bad" | "none";

export const PERF_ACTIVE = new Set(["queued", "running"]);

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

export type Opportunity = { id: string; title: string; savingsMs: number };
export type Diagnostic = { id: string; title: string; value: string };

export function readOpportunities(value: unknown): Opportunity[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Opportunity =>
      typeof item?.id === "string" &&
      typeof item?.title === "string" &&
      typeof item?.savingsMs === "number",
  );
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
