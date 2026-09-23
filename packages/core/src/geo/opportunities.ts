/**
 * Turning GEO measurements into things worth doing.
 *
 * Every field on a draft is derived from an observation. The priority is a
 * weighted sum over inputs that are stored alongside it, so a number on screen
 * can always be reconstructed without re-running anything — and without a model
 * ever having produced it.
 *
 * Only failures become opportunities. An `unknown` check is a gap in what we
 * observed, not a finding about the site: reporting "your robots.txt is broken"
 * when the truth is "we never read it" would be the same class of lie as
 * inventing a score.
 */

import { opportunityBand, type OpportunityBand } from "../scoring/bands";
import { redistribute } from "../scoring/weights";
import { isDiscoveryAgent } from "./agents";
import type { CrawlerAccessResult, GeoAccessCheck } from "./crawler-access";
import { GEO_ACCESS_CHECK_LABELS } from "./crawler-access";
import {
  clamp01,
  type GeoDimensionId,
  type GeoEffort,
  type GeoEvidenceItem,
  type GeoOpportunityType,
  type GeoSeverity,
} from "./types";

export type GeoOpportunityDraft = {
  type: GeoOpportunityType;
  title: string;
  explanation: string;
  recommendedAction: string;
  severity: GeoSeverity;
  priority: number;
  priorityBand: OpportunityBand;
  priorityParts: Record<string, { raw: number; weight: number; points: number }>;
  estimatedEffort: GeoEffort;
  dimension: GeoDimensionId | null;
  affectedPageIds: string[];
  affectedUrls: string[];
  evidence: GeoEvidenceItem[];
};

/**
 * What decides the order of the list.
 *
 * `dimensionWeight` is how much of the readiness score the finding sits under,
 * `currentGap` how far that dimension is from full marks, `reach` how much of
 * the site it touches, and `effort` favours the cheap win when two findings are
 * otherwise equal.
 */
export const GEO_PRIORITY_WEIGHTS = {
  dimensionWeight: 35,
  currentGap: 30,
  reach: 20,
  effort: 15,
} as const;

const EFFORT_VALUE: Record<GeoEffort, number> = { low: 1, medium: 0.6, high: 0.25 };

const DIMENSION_WEIGHT: Record<GeoDimensionId, number> = {
  entityClarity: 20,
  contentExtractability: 15,
  answerCoverage: 15,
  structuredData: 15,
  aiCrawlerAccess: 15,
  citationReadiness: 10,
  businessInfo: 10,
};

export function geoPriority(input: {
  dimension: GeoDimensionId | null;
  /** The dimension's measured value, 0..1. Null when it could not be measured. */
  measured: number | null;
  affected: number;
  total: number;
  effort: GeoEffort;
}) {
  const dimensionWeight = input.dimension ? DIMENSION_WEIGHT[input.dimension] / 20 : null;

  const result = redistribute(GEO_PRIORITY_WEIGHTS, {
    dimensionWeight: dimensionWeight == null ? null : clamp01(dimensionWeight),
    // A dimension we could not measure has no known gap, so it contributes
    // nothing rather than being treated as a total failure.
    currentGap: input.measured == null ? null : clamp01(1 - input.measured),
    reach: input.total > 0 ? clamp01(input.affected / input.total) : null,
    effort: EFFORT_VALUE[input.effort],
  });

  const score = result.score ?? 0;
  return { score, band: opportunityBand(score), parts: result.parts };
}

/** How bad each failing accessibility check is, and what it costs to fix. */
const ACCESS_RULES: Record<
  string,
  { severity: GeoSeverity; effort: GeoEffort; action: string }
> = {
  "robots-root": {
    severity: "critical",
    effort: "low",
    action: "Allow this crawler in robots.txt, or confirm the block is deliberate.",
  },
  "robots-key-pages": {
    severity: "high",
    effort: "low",
    action: "Narrow the Disallow rules so the pages you want found are reachable.",
  },
  "http-status": {
    severity: "high",
    effort: "medium",
    action: "Fix or redirect the pages returning an error status.",
  },
  "auth-wall": {
    severity: "high",
    effort: "medium",
    action: "Serve readable content to crawlers, or accept that these pages cannot be found.",
  },
  noindex: {
    severity: "medium",
    effort: "low",
    action: "Remove noindex from pages that should be eligible for Google's AI features.",
  },
};

/**
 * Accessibility findings.
 *
 * A check is reported once per distinct failure rather than once per agent, so
 * one robots.txt rule blocking four crawlers is one item naming all four, not
 * four near-identical rows.
 */
export function deriveAccessOpportunities(
  access: CrawlerAccessResult,
  context: { pageCount: number; pageIds: string[]; pageUrls: string[] },
): GeoOpportunityDraft[] {
  const drafts: GeoOpportunityDraft[] = [];

  // A site-wide block already fails the key-pages check too. Reporting both
  // would be two rows saying the same thing, so the root block subsumes it.
  const rootBlocked = access.signals["robots-root"] === "fail";

  for (const [check, rule] of Object.entries(ACCESS_RULES) as Array<
    [GeoAccessCheck, (typeof ACCESS_RULES)[string]]
  >) {
    if (access.signals[check] !== "fail") continue;
    if (check === "robots-key-pages" && rootBlocked) continue;

    const blocked = access.matrix.filter(
      (row) => isDiscoveryAgent(row.agent) && row.checks[check]?.status === "fail",
    );
    if (blocked.length === 0) continue;

    const names = blocked.map((row) => row.agent.label);
    const detail = blocked[0]!.checks[check]!.detail;

    const priority = geoPriority({
      dimension: "aiCrawlerAccess",
      measured: access.raw,
      // Root-level blocks affect everything; the rest are scoped by their detail.
      affected: check === "robots-root" ? context.pageCount : Math.max(1, context.pageCount / 2),
      total: context.pageCount,
      effort: rule.effort,
    });

    drafts.push({
      type: "AI_CRAWLER_ACCESS",
      title:
        check === "robots-root"
          ? `${names.join(", ")} cannot reach this site`
          : `${GEO_ACCESS_CHECK_LABELS[check]} is failing for ${names.join(", ")}`,
      explanation: detail,
      recommendedAction: rule.action,
      severity: rule.severity,
      priority: priority.score,
      priorityBand: priority.band,
      priorityParts: priority.parts,
      estimatedEffort: rule.effort,
      dimension: "aiCrawlerAccess",
      affectedPageIds: context.pageIds,
      affectedUrls: context.pageUrls.slice(0, 20),
      evidence: [
        { label: "Check", value: GEO_ACCESS_CHECK_LABELS[check], source: "robots.txt / crawl" },
        { label: "Observed", value: detail, source: "crawl" },
        { label: "Crawlers affected", value: names.join(", "), source: "robots.txt" },
      ],
    });
  }

  return drafts.sort((a, b) => b.priority - a.priority);
}
