/**
 * Four separate 0-100 scores exist in this product and must never be read as
 * the same number, so each gets its own band vocabulary. The words deliberately
 * do not overlap:
 *
 *   Competitor Confidence -> primary / secondary / peripheral / unrelated
 *   SEO Score             -> excellent / good / fair / poor
 *   Opportunity Score     -> critical / high / medium / low
 *   AI Search Readiness   -> ready / emerging / limited / unprepared
 *
 * GEO opportunity priority deliberately reuses `opportunityBand` instead of
 * adding a fifth set: it is the same kind of number (how urgent is this work),
 * so a separate vocabulary there would be noise rather than clarity.
 */

/** Matches the `Rating` union the dashboard already uses for color tokens. */
export type Rating = "good" | "warn" | "bad" | "none";

export type ConfidenceBand = "primary" | "secondary" | "peripheral" | "unrelated";
export type SeoScoreBand = "excellent" | "good" | "fair" | "poor";
export type OpportunityBand = "critical" | "high" | "medium" | "low";
export type GeoReadinessBand = "ready" | "emerging" | "limited" | "unprepared";

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

/**
 * How prepared a site is for AI-driven search. Preparedness, never a prediction:
 * nothing here says an assistant will cite the site, only that the evidence an
 * assistant would need is present and legible.
 */
export function geoReadinessBand(score: number): GeoReadinessBand {
  if (score >= 80) return "ready";
  if (score >= 60) return "emerging";
  if (score >= 35) return "limited";
  return "unprepared";
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

export const geoReadinessBandLabels: Record<GeoReadinessBand, string> = {
  ready: "Ready for AI search",
  emerging: "Emerging",
  limited: "Limited",
  unprepared: "Unprepared",
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

export const geoReadinessBandRating: Record<GeoReadinessBand, Rating> = {
  ready: "good",
  emerging: "good",
  limited: "warn",
  unprepared: "bad",
};
