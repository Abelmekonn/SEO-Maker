import type { PerformanceAudit } from "@seo-maker/db";
import {
  extraMetrics,
  readDiagnostics,
  readOpportunities,
  type Diagnostic,
  type Opportunity,
} from "@/lib/performance";
import { pagePath } from "@/lib/site-url";

export type PerfStrategy = "mobile" | "desktop";

export type PerfAuditView = {
  id: string;
  pageId: string;
  path: string;
  strategy: PerfStrategy;
  createdAt: string;
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  fcp: number | null;
  tbt: number | null;
  ttfb: number | null;
  speedIndex: number | null;
  opportunities: Opportunity[];
  diagnostics: Diagnostic[];
};

export type PerfPageView = {
  id: string;
  path: string;
  title: string;
  crawled: boolean;
  pageType: string | null;
};

export type PerfHistoryPoint = {
  createdAt: string;
  strategy: PerfStrategy;
  performance: number | null;
  lcp: number | null;
  cls: number | null;
};

/** `pageId` is the page on screen: results are stored by URL and may come from an earlier crawl's row. */
export function toAuditView(
  audit: PerformanceAudit,
  path: string,
  pageId: string,
): PerfAuditView {
  const extra = extraMetrics(audit.rawData);
  return {
    id: audit.id,
    pageId,
    path,
    strategy: audit.strategy === "desktop" ? "desktop" : "mobile",
    createdAt: audit.createdAt.toISOString(),
    performance: audit.performance,
    accessibility: audit.accessibility,
    bestPractices: audit.bestPractices,
    seo: audit.seo,
    lcp: audit.lcp,
    inp: audit.inp,
    cls: audit.cls,
    fcp: audit.fcp,
    tbt: audit.tbt,
    ttfb: extra.ttfb,
    speedIndex: extra.speedIndex,
    opportunities: readOpportunities(audit.opportunities),
    diagnostics: readDiagnostics(audit.diagnostics),
  };
}

export function latestByStrategy(audits: PerfAuditView[], strategy: PerfStrategy) {
  const latest = new Map<string, PerfAuditView>();
  for (const audit of audits) {
    if (audit.strategy !== strategy) continue;
    const current = latest.get(audit.pageId);
    if (!current || current.createdAt < audit.createdAt) {
      latest.set(audit.pageId, audit);
    }
  }
  return latest;
}

export function pagePathFromUrl(url: string) {
  return pagePath(url);
}
