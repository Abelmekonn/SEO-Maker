/**
 * GEO / AI Search Visibility — shared vocabulary.
 *
 * The governing rule for everything under `geo/`:
 *
 *   The LLM decides WHAT WOULD COUNT as evidence.
 *   Deterministic code decides WHETHER THE SITE HAS IT.
 *
 * Any number a model emits is a 0..1 confidence in its own reading, stored
 * beside the claim it belongs to. It is never multiplied into a score.
 */

/**
 * Bumped whenever a formula, weight or threshold under `geo/` changes.
 *
 * It is part of `GeoAudit.inputFingerprint`, so changing a rule invalidates the
 * "nothing changed, skip the run" short-circuit. Without it a scoring fix would
 * silently never reach projects whose content had not changed.
 */
export const GEO_RULESET_VERSION = "1.0.0";

/**
 * The result of one accessibility check for one crawler.
 *
 * `unknown` and `not_tested` are not failures and must never be scored as zero
 * or coloured red. They map to a null measurement, which `redistribute` drops
 * and whose weight it spreads across the checks that did produce an answer.
 *
 *   pass       we observed the thing and it is fine
 *   fail       we observed the thing and it is not fine
 *   unknown    we tried to observe it and could not (robots.txt 503, a
 *              bot challenge, a page we never fetched)
 *   not_tested we did not try, and saying otherwise would be a lie — this is
 *              what a live fetch as another user-agent gets, because we never
 *              impersonate one
 */
export type GeoCheckStatus = "pass" | "fail" | "unknown" | "not_tested";

export const geoCheckStatusLabels: Record<GeoCheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  unknown: "Unknown",
  not_tested: "Not tested",
};

/** 0..1, or null when the check produced no answer. Feeds `redistribute`. */
export function statusValue(status: GeoCheckStatus): number | null {
  if (status === "pass") return 1;
  if (status === "fail") return 0;
  return null;
}

export type GeoDimensionId =
  | "entityClarity"
  | "contentExtractability"
  | "answerCoverage"
  | "structuredData"
  | "aiCrawlerAccess"
  | "citationReadiness"
  | "businessInfo";

export const GEO_DIMENSION_IDS: GeoDimensionId[] = [
  "entityClarity",
  "contentExtractability",
  "answerCoverage",
  "structuredData",
  "aiCrawlerAccess",
  "citationReadiness",
  "businessInfo",
];

export const GEO_DIMENSION_LABELS: Record<GeoDimensionId, string> = {
  entityClarity: "Entity clarity",
  contentExtractability: "Content extractability",
  answerCoverage: "Answer coverage",
  structuredData: "Structured data",
  aiCrawlerAccess: "AI crawler access",
  citationReadiness: "Citation readiness",
  businessInfo: "Business information",
};

/**
 * Why a dimension was not measured. Rendered verbatim next to "Not measured",
 * because a score the user cannot account for is worse than no score.
 */
export type NotMeasuredReason = {
  dimension: GeoDimensionId;
  reason: string;
};

/**
 * Whether a dimension ran on full evidence or on a narrowed deterministic
 * fallback. `deterministic-baseline` means we scored it without the AI's
 * reading — honest, but narrower, and the UI has to say so.
 */
export type GeoBasis = "full" | "deterministic-baseline" | "partial";

export type CoverageStatus = "answered" | "partially_answered" | "not_found";

export const coverageStatusLabels: Record<CoverageStatus, string> = {
  answered: "Answered",
  partially_answered: "Partially answered",
  not_found: "Not found",
};

export type QuestionIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational"
  | "local";

export const GEO_OPPORTUNITY_TYPES = [
  "ENTITY_CLARITY",
  "ENTITY_CONSISTENCY",
  "STRUCTURED_DATA",
  "AI_CRAWLER_ACCESS",
  "ANSWER_GAP",
  "CONTENT_EXTRACTABILITY",
  "BUSINESS_INFORMATION",
  "CITATION_READINESS",
  "INTERNAL_LINKING",
  "SERVICE_COVERAGE",
  "LOCATION_COVERAGE",
] as const;

export type GeoOpportunityType = (typeof GEO_OPPORTUNITY_TYPES)[number];

export const GEO_OPPORTUNITY_TYPE_LABELS: Record<GeoOpportunityType, string> = {
  ENTITY_CLARITY: "Entity clarity",
  ENTITY_CONSISTENCY: "Entity consistency",
  STRUCTURED_DATA: "Structured data",
  AI_CRAWLER_ACCESS: "AI crawler access",
  ANSWER_GAP: "Answer gap",
  CONTENT_EXTRACTABILITY: "Content extractability",
  BUSINESS_INFORMATION: "Business information",
  CITATION_READINESS: "Citation readiness",
  INTERNAL_LINKING: "Internal linking",
  SERVICE_COVERAGE: "Service coverage",
  LOCATION_COVERAGE: "Location coverage",
};

export type GeoSeverity = "critical" | "high" | "medium" | "low";
export type GeoEffort = "low" | "medium" | "high";

/**
 * `partial` is a real outcome, not a soft failure: at least one dimension was
 * measured and at least one phase could not run. A provider outage lands here
 * with the whole deterministic half of the score intact.
 */
export type GeoAuditStatus = "pending" | "running" | "completed" | "partial" | "failed";

export type GeoTrigger = "crawl" | "manual" | "retry";

export type GeoMode = "quick" | "deep";

/** One traceable observation behind a finding. Never free-form prose. */
export type GeoEvidenceItem = {
  label: string;
  value: string;
  /** Where it came from, e.g. "Page.content", "PageEvidence.schema", "robots.txt". */
  source: string;
};

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
