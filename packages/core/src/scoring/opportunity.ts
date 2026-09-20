import { type OpportunityBand, opportunityBand } from "./bands";
import { type Part, redistribute } from "./weights";

/**
 * OPPORTUNITY SCORE — "how valuable is closing this specific gap?"
 *
 * A prioritization score for our own backlog. It says nothing about how Google
 * ranks anything, and it is not the site's SEO score.
 */
export type OpportunityPartId =
  | "relevance"
  | "competitorCoverage"
  | "currentGap"
  | "searchSignal"
  | "businessValue";

export const OPPORTUNITY_WEIGHTS: Record<OpportunityPartId, number> = {
  relevance: 30,
  competitorCoverage: 25,
  currentGap: 20,
  searchSignal: 15,
  businessValue: 10,
};

export const OPPORTUNITY_PART_LABELS: Record<OpportunityPartId, string> = {
  relevance: "Relevance to your business",
  competitorCoverage: "Competitor coverage",
  currentGap: "Size of your gap",
  searchSignal: "Search demand",
  businessValue: "Business value",
};

export type OpportunityInput = {
  /** 0..1 relevance of the topic to this business. */
  relevance: number | null;
  competitorsCovering: number;
  competitorsTotal: number;
  /** 0..1 how well we already cover it. Null when we could not tell. */
  selfCoverage: number | null;
  /** Monthly search volume. Null whenever no SERP provider is configured. */
  searchVolume: number | null;
  /** 0..100 keyword difficulty, when a provider supplies it. */
  difficulty: number | null;
  businessValue: number | null;
};

export type OpportunityResult = {
  score: number | null;
  band: OpportunityBand | null;
  parts: Record<OpportunityPartId, Part>;
  weights: Record<OpportunityPartId, number>;
  notMeasured: OpportunityPartId[];
};

/**
 * Log-scales volume so 10k saturates, then discounts by difficulty — but never
 * by more than half, because a hard keyword is still worth knowing about.
 */
export function searchSignal(volume: number | null, difficulty: number | null): number | null {
  if (volume == null) return null;
  const scaled = Math.max(0, Math.min(1, Math.log10(volume + 1) / 4));
  const penalty = difficulty == null ? 1 : 1 - Math.max(0, Math.min(100, difficulty)) / 200;
  return scaled * penalty;
}

export function opportunityScore(input: OpportunityInput): OpportunityResult {
  const measured: Record<OpportunityPartId, number | null> = {
    relevance: input.relevance,
    competitorCoverage:
      input.competitorsTotal <= 0 ? null : input.competitorsCovering / input.competitorsTotal,
    currentGap: input.selfCoverage == null ? null : 1 - input.selfCoverage,
    searchSignal: searchSignal(input.searchVolume, input.difficulty),
    businessValue: input.businessValue,
  };

  const result = redistribute(OPPORTUNITY_WEIGHTS, measured);
  return {
    score: result.score,
    band: result.score == null ? null : opportunityBand(result.score),
    parts: result.parts,
    weights: result.weights,
    notMeasured: result.notMeasured,
  };
}
