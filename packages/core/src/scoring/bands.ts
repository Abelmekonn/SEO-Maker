/**
 * Three separate 0-100 scores exist in this product and must never be read as
 * the same number, so each gets its own band vocabulary. The words deliberately
 * do not overlap:
 *
 *   Competitor Confidence -> primary / secondary / peripheral / unrelated
 *   SEO Score             -> excellent / good / fair / poor
 *   Opportunity Score     -> critical / high / medium / low
 */

/** Matches the `Rating` union the dashboard already uses for color tokens. */
export type Rating = "good" | "warn" | "bad" | "none";

export type ConfidenceBand = "primary" | "secondary" | "peripheral" | "unrelated";
export type SeoScoreBand = "excellent" | "good" | "fair" | "poor";
export type OpportunityBand = "critical" | "high" | "medium" | "low";

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= 75) return "primary";
  if (score >= 50) return "secondary";
  if (score >= 25) return "peripheral";
  return "unrelated";
}

export function seoScoreBand(score: number): SeoScoreBand {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

export function opportunityBand(score: number): OpportunityBand {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export const confidenceBandLabels: Record<ConfidenceBand, string> = {
  primary: "Primary competitor",
  secondary: "Secondary competitor",
  peripheral: "Peripheral",
  unrelated: "Unrelated",
};

export const seoScoreBandLabels: Record<SeoScoreBand, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const opportunityBandLabels: Record<OpportunityBand, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Expresses how strong the competition signal is, not whether it is desirable. */
export const confidenceBandRating: Record<ConfidenceBand, Rating> = {
  primary: "good",
  secondary: "warn",
  peripheral: "none",
  unrelated: "none",
};

export const seoScoreBandRating: Record<SeoScoreBand, Rating> = {
  excellent: "good",
  good: "good",
  fair: "warn",
  poor: "bad",
};

export const opportunityBandRating: Record<OpportunityBand, Rating> = {
  critical: "bad",
  high: "warn",
  medium: "warn",
  low: "none",
};
