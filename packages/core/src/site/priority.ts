/**
 * Site priority (Phase 3.2 / architecture §12).
 *
 * "Code owns numeric score/band. AI owns explanation and action wording."
 * This is the code half. Every input is evidence the crawl recorded, so the
 * same crawl always produces the same order, and the parts are stored with the
 * score so any ranking can be audited after the fact.
 *
 * Shares the Opportunity Score's band vocabulary (critical/high/medium/low):
 * both answer "how valuable is acting on this", and the Opportunity table
 * stores either.
 */

import { type OpportunityBand, opportunityBand } from "../scoring/bands";
import type { CheckSeverity } from "../scoring/page-audit";
import { type Part, redistribute } from "../scoring/weights";

export type Effort = "low" | "medium" | "high";

export type PriorityPartId =
  | "severity"
  | "reach"
  | "importance"
  | "indexability"
  | "performance"
  | "ease"
  | "confidence";

/**
 * Impact dominates. Indexability and performance are impact dimensions like
 * the others: a missing meta description has zero indexability impact, which
 * is a measured zero, not an unknown, so it is what ranks a page that search
 * engines cannot index above one whose snippet is weak.
 */
export const PRIORITY_WEIGHTS: Record<PriorityPartId, number> = {
  severity: 25,
  reach: 20,
  importance: 20,
  indexability: 15,
  performance: 10,
  ease: 5,
  confidence: 5,
};

export const PRIORITY_PART_LABELS: Record<PriorityPartId, string> = {
  severity: "Severity",
  reach: "Pages affected",
  importance: "Importance of those pages",
  indexability: "Keeps pages out of search",
  performance: "Performance impact",
  ease: "Ease of fixing",
  confidence: "Confidence in the evidence",
};

const SEVERITY_VALUE: Record<CheckSeverity, number> = {
  critical: 1,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

const EASE: Record<Effort, number> = { low: 1, medium: 0.6, high: 0.3 };

export type PriorityInput = {
  severity: CheckSeverity;
  affectedPages: number;
  totalPages: number;
  /**
   * Importance (0..1) of each affected page. Null for a finding not tied to
   * pages; its weight is then spread over the parts that were measured.
   */
  importance: number[] | null;
  /** 0..1: 1 means the condition keeps pages out of search results. */
  indexabilityImpact: number;
  /** 0..1: 1 means a poor Core Web Vitals band on the affected pages. */
  performanceImpact: number;
  effort: Effort;
  /** 0..1: how sure the evidence is. A deterministic check failure is 1. */
  confidence: number;
};

export type PriorityResult = {
  score: number;
  band: OpportunityBand;
  parts: Record<PriorityPartId, Part>;
  weights: Record<PriorityPartId, number>;
  notMeasured: PriorityPartId[];
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Share of the site affected, square-rooted: a problem on 4% of pages is not
 * a twenty-fifth as urgent as one on every page, it is about a fifth.
 */
export function reach(affected: number, total: number): number {
  if (affected <= 0) return 0;
  return clamp01(Math.sqrt(affected / Math.max(1, total, affected)));
}

/** The most important affected page counts most; the rest still count. */
export function combinedImportance(values: number[]): number {
  if (values.length === 0) return 0;
  const max = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clamp01(max * 0.6 + mean * 0.4);
}

export function sitePriority(input: PriorityInput): PriorityResult {
  const measured: Record<PriorityPartId, number | null> = {
    severity: SEVERITY_VALUE[input.severity] ?? 0.25,
    reach: reach(input.affectedPages, input.totalPages),
    importance: input.importance == null ? null : combinedImportance(input.importance),
    indexability: clamp01(input.indexabilityImpact),
    performance: clamp01(input.performanceImpact),
    ease: EASE[input.effort],
    confidence: clamp01(input.confidence),
  };
  const result = redistribute(PRIORITY_WEIGHTS, measured);
  const score = result.score ?? 0;
  return {
    score,
    band: opportunityBand(score),
    parts: result.parts,
    weights: result.weights,
    notMeasured: result.notMeasured,
  };
}
