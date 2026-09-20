import { type SeoScoreBand, seoScoreBand } from "./bands";
import {
  type AuditablePage,
  isCrawled,
  onPageCheckIds,
  siteCategoryScore,
  technicalCheckIds,
} from "./page-audit";
import { type Part, redistribute } from "./weights";

/**
 * SEO SCORE — SEO Maker's own diagnostic score for a site, 0-100.
 * Not a Google ranking score, and not the competitor-confidence score.
 *
 * Deliberately separate from the flat 13-check `pageSeoScore`, which still
 * powers the per-page screens. This one is weighted across six dimensions and
 * drops any dimension we could not measure rather than scoring it zero.
 */
export type SeoDimensionId =
  | "technical"
  | "onPage"
  | "content"
  | "performance"
  | "internalLinks"
  | "structuredData";

export const SEO_WEIGHTS: Record<SeoDimensionId, number> = {
  technical: 20,
  onPage: 20,
  content: 25,
  performance: 15,
  internalLinks: 10,
  structuredData: 10,
};

export const SEO_DIMENSION_LABELS: Record<SeoDimensionId, string> = {
  technical: "Technical SEO",
  onPage: "On-page SEO",
  content: "Content",
  performance: "Performance",
  internalLinks: "Internal linking",
  structuredData: "Structured data",
};

export type SeoScoreResult = {
  score: number | null;
  band: SeoScoreBand | null;
  /** Each dimension 0-100, or null when it could not be measured. */
  dimensions: Record<SeoDimensionId, number | null>;
  weights: Record<SeoDimensionId, number>;
  notMeasured: SeoDimensionId[];
  parts: Record<SeoDimensionId, Part>;
};

const TARGET_WORDS = 800;
const TARGET_INTERNAL_LINKS = 20;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 100 when present and well-sized, 60 when present but off-target, 0 when absent. */
function lengthQuality(value: string | null | undefined, min: number, max: number) {
  const text = value?.trim();
  if (!text) return 0;
  return text.length >= min && text.length <= max ? 100 : 60;
}

function contentScore(pages: AuditablePage[]): number | null {
  const scored = pages.filter((page) => page.wordCount != null);
  if (scored.length === 0) return null;
  return Math.round(
    mean(
      scored.map(
        (page) =>
          0.5 * clamp01((page.wordCount ?? 0) / TARGET_WORDS) * 100 +
          0.25 * lengthQuality(page.title, 30, 65) +
          0.25 * lengthQuality(page.metaDesc, 70, 160),
      ),
    ),
  );
}

function internalLinksScore(pages: AuditablePage[]): number | null {
  const scored = pages.filter((page) => page.internalLinks != null);
  if (scored.length === 0) return null;
  return Math.round(
    clamp01(mean(scored.map((page) => page.internalLinks ?? 0)) / TARGET_INTERNAL_LINKS) * 100,
  );
}

function structuredDataScore(pages: AuditablePage[]): number | null {
  const scored = pages.filter((page) => page.schemaCount != null);
  if (scored.length === 0) return null;
  const withSchema = scored.filter((page) => (page.schemaCount ?? 0) >= 1).length;
  return Math.round((withSchema / scored.length) * 100);
}

function technicalScore(pages: AuditablePage[]): number | null {
  // A crawl that never got a status code tells us nothing about technical health.
  if (!pages.some((page) => page.statusCode != null)) return null;
  return siteCategoryScore(pages, technicalCheckIds);
}

export function weightedSeoScore(input: {
  pages: AuditablePage[];
  /** Lighthouse/PSI performance score 0-100. Null or omitted when it was not run. */
  performanceScore?: number | null;
}): SeoScoreResult {
  const crawled = input.pages.filter(isCrawled);

  const dimensions: Record<SeoDimensionId, number | null> = {
    technical: technicalScore(crawled),
    onPage: crawled.length === 0 ? null : siteCategoryScore(crawled, onPageCheckIds),
    content: contentScore(crawled),
    performance: input.performanceScore ?? null,
    internalLinks: internalLinksScore(crawled),
    structuredData: structuredDataScore(crawled),
  };

  const measured = Object.fromEntries(
    (Object.keys(dimensions) as SeoDimensionId[]).map((key) => [
      key,
      dimensions[key] == null ? null : dimensions[key]! / 100,
    ]),
  ) as Record<SeoDimensionId, number | null>;

  const result = redistribute(SEO_WEIGHTS, measured);
  return {
    score: result.score,
    band: result.score == null ? null : seoScoreBand(result.score),
    dimensions,
    weights: result.weights,
    notMeasured: result.notMeasured,
    parts: result.parts,
  };
}
