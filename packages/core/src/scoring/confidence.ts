import { type ConfidenceBand, confidenceBand } from "./bands";
import { type Part, redistribute } from "./weights";

/**
 * COMPETITOR CONFIDENCE — "how strongly does this domain compete with us in search?"
 *
 * This is not an SEO score and not a ranking prediction. It measures how much
 * evidence we have that the two sites are after the same searches.
 */
export type ConfidencePartId =
  | "queryCoverage"
  | "rankingVisibility"
  | "queryRelevance"
  | "businessSimilarity"
  | "locationSimilarity"
  | "classificationConfidence";

export const CONFIDENCE_WEIGHTS: Record<ConfidencePartId, number> = {
  queryCoverage: 25,
  rankingVisibility: 20,
  queryRelevance: 20,
  businessSimilarity: 15,
  locationSimilarity: 10,
  classificationConfidence: 10,
};

export type CompetitorSource = "manual" | "serp" | "ai";

export type ConfidenceInput = {
  /** Tracked queries this domain also appears in. */
  sharedQueries: number;
  totalQueries: number;
  /** 1-based SERP positions across the shared queries. */
  positions: number[];
  /** Mean 0..1 relevance of the shared queries to our business. */
  queryRelevance: number | null;
  businessType: string | null;
  selfBusinessType: string | null;
  country: string | null;
  language: string | null;
  selfCountry: string | null;
  selfLanguage: string | null;
  source: CompetitorSource;
  classificationConfidence: number | null;
};

export type ConfidenceResult = {
  score: number | null;
  band: ConfidenceBand | null;
  parts: Record<ConfidencePartId, Part>;
  weights: Record<ConfidencePartId, number>;
  notMeasured: ConfidencePartId[];
};

/**
 * Sharing half of our tracked queries already means a domain is competing hard,
 * so coverage saturates at 50%. A plain shared/total ratio would score genuine
 * competitors near zero, because no two sites overlap on every query.
 */
export function queryCoverage(shared: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(1, shared / total / 0.5);
}

/**
 * Visibility of a single 1-based SERP position, front-loaded so the top spots
 * dominate: p1 = 1.0, p2 = 0.5, p5 ≈ 0.30, p10 ≈ 0.23, p100 ≈ 0.13.
 * Stays positive at every position — ranking 100th is weak evidence, not none.
 */
export function positionVisibility(position: number): number {
  const p = Math.max(1, position);
  return 1 / (1 + Math.log2(p));
}

const BUSINESS_FAMILIES: Record<string, string[]> = {
  saas: ["product"],
  marketplace: ["product", "retail"],
  ecommerce: ["retail"],
  blog: ["publisher"],
  media: ["publisher"],
  agency: ["services"],
  "local-service": ["services"],
};

export function businessSimilarity(a: string | null, b: string | null): number | null {
  // "other" is a real classification but carries no similarity signal.
  if (!a || !b || a === "other" || b === "other") return null;
  if (!(a in BUSINESS_FAMILIES) || !(b in BUSINESS_FAMILIES)) return null;
  if (a === b) return 1;
  const shared = BUSINESS_FAMILIES[a].some((family) => BUSINESS_FAMILIES[b].includes(family));
  return shared ? 0.6 : 0.25;
}

export function locationSimilarity(
  country: string | null,
  language: string | null,
  selfCountry: string | null,
  selfLanguage: string | null,
): number | null {
  const haveSelf = selfCountry != null || selfLanguage != null;
  const haveOther = country != null || language != null;
  if (!haveSelf || !haveOther) return null;

  const sameCountry =
    country != null && selfCountry != null && country.toLowerCase() === selfCountry.toLowerCase();
  const sameLanguage =
    language != null &&
    selfLanguage != null &&
    language.toLowerCase() === selfLanguage.toLowerCase();

  if (sameCountry && sameLanguage) return 1;
  if (sameLanguage) return 0.7;
  if (sameCountry) return 0.4;
  return 0.1;
}

/**
 * Signals that constitute actual evidence of competing in search.
 *
 * Business similarity and classification certainty describe what a domain *is*,
 * not that it competes with us, so they can never produce a score on their own.
 */
const EVIDENCE_PARTS: ConfidencePartId[] = [
  "queryCoverage",
  "rankingVisibility",
  "queryRelevance",
];

export function competitorConfidence(input: ConfidenceInput): ConfidenceResult {
  const measured: Record<ConfidencePartId, number | null> = {
    queryCoverage: queryCoverage(input.sharedQueries, input.totalQueries),
    rankingVisibility:
      input.positions.length === 0
        ? null
        : input.positions.reduce((sum, position) => sum + positionVisibility(position), 0) /
          input.positions.length,
    queryRelevance: input.queryRelevance,
    businessSimilarity: businessSimilarity(input.businessType, input.selfBusinessType),
    locationSimilarity: locationSimilarity(
      input.country,
      input.language,
      input.selfCountry,
      input.selfLanguage,
    ),
    // A competitor the user added by hand is asserted, not inferred.
    classificationConfidence:
      input.source === "manual" ? 1 : (input.classificationConfidence ?? 0.5),
  };

  const result = redistribute(CONFIDENCE_WEIGHTS, measured);

  // Without a single search-evidence signal there is nothing to be confident
  // about. Reporting "100 / primary" off the back of a manual add alone would
  // invent certainty we have not earned.
  const hasEvidence = EVIDENCE_PARTS.some((part) => measured[part] != null);
  if (!hasEvidence) {
    return {
      score: null,
      band: null,
      parts: result.parts,
      weights: result.weights,
      notMeasured: result.notMeasured,
    };
  }

  return {
    score: result.score,
    band: result.score == null ? null : confidenceBand(result.score),
    parts: result.parts,
    weights: result.weights,
    notMeasured: result.notMeasured,
  };
}

export const CONFIDENCE_PART_LABELS: Record<ConfidencePartId, string> = {
  queryCoverage: "Shared searches",
  rankingVisibility: "Ranking visibility",
  queryRelevance: "Search relevance",
  businessSimilarity: "Business similarity",
  locationSimilarity: "Market overlap",
  classificationConfidence: "Classification certainty",
};
