import { type ConfidenceBand, confidenceBand } from "./bands";
import { type Part, redistribute } from "./weights";

/**
 * COMPETITOR CONFIDENCE — "how strongly does this domain compete with us in search?"
 *
 * This is not an SEO score and not a ranking prediction. It measures how much
 * evidence we have that the two sites are after the same searches.
 *
 * Calculated by code only: `calculateCompetitorConfidence` is the one place
 * the number is made. AI never sets it, and a signal that could not be
 * measured is excluded (its weight redistributed), never counted as zero.
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

export const CONFIDENCE_PART_IDS = Object.keys(CONFIDENCE_WEIGHTS) as ConfidencePartId[];

export const CONFIDENCE_PART_LABELS: Record<ConfidencePartId, string> = {
  queryCoverage: "Shared searches",
  rankingVisibility: "Ranking visibility",
  queryRelevance: "Search relevance",
  businessSimilarity: "Business similarity",
  locationSimilarity: "Market overlap",
  classificationConfidence: "Classification certainty",
};

export type CompetitorSource = "manual" | "serp" | "ai";

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

// ------------------------------------------------------------------ evidence

/**
 * One measured signal: a 0..1 score, the evidence behind it, or, when it
 * could not be measured, the reason why. Never a bare null.
 */
export type SignalMeasurement = {
  score: number | null;
  evidence: Record<string, unknown> | null;
  reason: string | null;
};

/** What the search results say about one competitor. See summarizeSearchEvidence. */
export type ConfidenceSearchEvidence = {
  /** Searches whose results were checked. */
  queriesChecked: number;
  /** Checked searches the competitor appears in. */
  appearanceCount: number;
  /** Checked searches you both appear in. */
  sharedQueryCount: number;
  /** Checked searches your site appears in. */
  selfAppearanceCount: number;
  /** The competitor's best position in each search it appears in. */
  positions: number[];
  top3: number;
  top10: number;
  top20: number;
  bestPosition: number | null;
  avgPosition: number | null;
  /** Mean 0..1 relevance to your business of the searches it appears in. Null when unknown. */
  meanRelevance: number | null;
};

export type CompetitorConfidenceEvidence = {
  /** Null when no search results could be checked. */
  search: ConfidenceSearchEvidence | null;
  /** Why search evidence is missing, shown on every search signal. */
  searchUnavailableReason?: string | null;
  business: SignalMeasurement & {
    /**
     * True when the similarity was measured from what both sites actually
     * say (their pages and your business context), not only from a type
     * label. Only then can it support a score on its own.
     */
    fromContent?: boolean;
  };
  market: SignalMeasurement;
  source: CompetitorSource;
  /** 0..1: how sure we are this is a business site, not a directory or publisher. */
  classificationConfidence: number | null;
  classificationEvidence?: Record<string, unknown> | null;
};

export type ConfidenceSignal = {
  id: ConfidencePartId;
  label: string;
  measured: boolean;
  /** Base weight, before redistribution. */
  weight: number;
  /** Weight after redistribution across the measured signals; 0 when unmeasured. */
  appliedWeight: number;
  /** 0..1, null when unmeasured. */
  score: number | null;
  points: number;
  evidence: Record<string, unknown> | null;
  /** Why it could not be measured. */
  reason: string | null;
};

/** Which evidence a confidence score rests on. */
export type ConfidenceBasis = "search" | "business";

/**
 * The most a score may be without search evidence: "Secondary" at best.
 * Business and market evidence show two sites sell the same thing to the
 * same market, which makes them likely to meet in search, but no search was
 * observed, so the score cannot claim a primary search competitor.
 */
export const BUSINESS_ONLY_CAP = 60;

export type CompetitorConfidence = {
  confidence: number | null;
  confidenceBand: ConfidenceBand | null;
  basis: ConfidenceBasis | null;
  signals: ConfidenceSignal[];
  measuredSignalCount: number;
  totalSignalCount: number;
  /** Applied weights, which sum to 100 across measured signals. */
  weights: Record<ConfidencePartId, number>;
  notMeasured: Array<{ id: ConfidencePartId; reason: string }>;
  /** Why there is no score, when there is none. */
  reason: string | null;
  /** The cap applied, when the score was held down for lack of search evidence. */
  cappedAt: number | null;
  /** The per-signal parts in the shape the SEO score uses. */
  parts: Record<ConfidencePartId, Part>;
};

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/**
 * The one competitor confidence calculation, shared by manual competitors
 * and automatic discovery.
 *
 *   Shared searches (25)     searches you target that it appears in; saturates at half
 *   Ranking visibility (20)  mean positionVisibility over the searches it appears in
 *   Search relevance (20)    mean relevance to your business of those searches
 *   Business similarity (15) offering and topic overlap from both sites' content
 *   Market overlap (10)      whether it serves your market (measureMarketOverlap)
 *   Classification (10)      you added it (1), or the share of its pages that are commercial
 *
 * Unmeasured signals carry their reason and are left out, their weight
 * spread over the rest. A score needs real evidence of competition: at
 * least one search signal, or business similarity measured from content.
 * Market and classification describe a domain; alone they score nothing.
 * Without any search signal the score is capped at BUSINESS_ONLY_CAP.
 */
export function calculateCompetitorConfidence(input: CompetitorConfidenceEvidence): CompetitorConfidence {
  const search = input.search && input.search.queriesChecked > 0 ? input.search : null;
  const searchMissing =
    input.searchUnavailableReason?.trim() || "No search results have been checked for your target searches yet.";

  const measurements: Record<ConfidencePartId, SignalMeasurement> = {
    queryCoverage: search
      ? {
          score: queryCoverage(search.appearanceCount, search.queriesChecked),
          reason: null,
          evidence: {
            appearances: search.appearanceCount,
            queriesChecked: search.queriesChecked,
            sharedWithYou: search.sharedQueryCount,
            youAppear: search.selfAppearanceCount,
          },
        }
      : { score: null, evidence: null, reason: searchMissing },
    rankingVisibility: !search
      ? { score: null, evidence: null, reason: searchMissing }
      : search.positions.length === 0
        ? {
            score: null,
            evidence: { queriesChecked: search.queriesChecked, appearances: 0 },
            reason: `Not found in the ${search.queriesChecked} searches checked, so there is no position to measure.`,
          }
        : {
            score: mean(search.positions.map(positionVisibility)),
            reason: null,
            evidence: {
              top3: search.top3,
              top10: search.top10,
              top20: search.top20,
              bestPosition: search.bestPosition,
              avgPosition: search.avgPosition == null ? null : round(search.avgPosition, 1),
              queriesChecked: search.queriesChecked,
            },
          },
    queryRelevance: !search
      ? { score: null, evidence: null, reason: searchMissing }
      : search.appearanceCount === 0
        ? { score: null, evidence: null, reason: "It appears in none of the searches checked." }
        : search.meanRelevance == null
          ? {
              score: null,
              evidence: null,
              reason: "Relevance needs your business context (services, description) to compare the searches against.",
            }
          : {
              score: search.meanRelevance,
              reason: null,
              evidence: { searches: search.appearanceCount, meanRelevance: round(search.meanRelevance) },
            },
    businessSimilarity: input.business,
    locationSimilarity: input.market,
    classificationConfidence:
      input.source === "manual"
        ? { score: 1, reason: null, evidence: { source: "manual", detail: "You added this competitor yourself." } }
        : input.classificationConfidence == null
          ? { score: null, evidence: null, reason: "Too few of its pages were analyzed to tell whether it is a business site." }
          : {
              score: input.classificationConfidence,
              reason: null,
              evidence: input.classificationEvidence ?? { source: input.source },
            },
  };

  const scores = Object.fromEntries(
    CONFIDENCE_PART_IDS.map((id) => {
      const value = measurements[id].score;
      return [id, value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value))];
    }),
  ) as Record<ConfidencePartId, number | null>;
  const result = redistribute(CONFIDENCE_WEIGHTS, scores);

  const signals: ConfidenceSignal[] = CONFIDENCE_PART_IDS.map((id) => {
    const measured = scores[id] != null;
    return {
      id,
      label: CONFIDENCE_PART_LABELS[id],
      measured,
      weight: CONFIDENCE_WEIGHTS[id],
      appliedWeight: round(result.weights[id], 1),
      score: scores[id] == null ? null : round(scores[id]!, 3),
      points: round(result.parts[id].points, 1),
      evidence: measurements[id].evidence,
      reason: measured ? null : (measurements[id].reason ?? "Not measured."),
    };
  });

  const hasSearch = scores.queryCoverage != null || scores.rankingVisibility != null || scores.queryRelevance != null;
  const hasBusiness = scores.businessSimilarity != null && input.business.fromContent === true;
  const basis: ConfidenceBasis | null = hasSearch ? "search" : hasBusiness ? "business" : null;
  const uncapped = basis ? result.score : null;
  const capped = basis === "business" && uncapped != null && uncapped > BUSINESS_ONLY_CAP;
  const confidence = capped ? BUSINESS_ONLY_CAP : uncapped;

  return {
    confidence,
    confidenceBand: confidence == null ? null : confidenceBand(confidence),
    basis,
    signals,
    measuredSignalCount: signals.filter((signal) => signal.measured).length,
    totalSignalCount: signals.length,
    weights: result.weights,
    notMeasured: signals.filter((signal) => !signal.measured).map((signal) => ({ id: signal.id, reason: signal.reason! })),
    reason:
      confidence != null
        ? null
        : "There is no evidence yet that this domain competes with you: no search results were checked, and business similarity could not be measured from its pages.",
    cappedAt: capped ? BUSINESS_ONLY_CAP : null,
    parts: result.parts,
  };
}

// ------------------------------------------------------------------ compact input

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
 * Confidence from compact inputs: counts, positions and type labels.
 *
 * A thin adapter over `calculateCompetitorConfidence`, so there is one
 * implementation. A business type label is not content evidence, so here
 * business similarity never supports a score on its own.
 */
export function competitorConfidence(input: ConfidenceInput): ConfidenceResult {
  const positions = input.positions.filter((position) => Number.isFinite(position) && position > 0);
  const result = calculateCompetitorConfidence({
    search:
      input.totalQueries > 0
        ? {
            queriesChecked: input.totalQueries,
            appearanceCount: input.sharedQueries,
            sharedQueryCount: input.sharedQueries,
            selfAppearanceCount: 0,
            positions,
            top3: positions.filter((p) => p <= 3).length,
            top10: positions.filter((p) => p <= 10).length,
            top20: positions.filter((p) => p <= 20).length,
            bestPosition: positions.length ? Math.min(...positions) : null,
            avgPosition: mean(positions),
            meanRelevance: input.queryRelevance,
          }
        : null,
    business: { score: businessSimilarity(input.businessType, input.selfBusinessType), evidence: null, reason: "Business type unknown." },
    market: {
      score: locationSimilarity(input.country, input.language, input.selfCountry, input.selfLanguage),
      evidence: null,
      reason: "Location unknown.",
    },
    source: input.source,
    classificationConfidence: input.classificationConfidence,
  });
  return {
    score: result.confidence,
    band: result.confidenceBand,
    parts: result.parts,
    weights: result.weights,
    notMeasured: result.notMeasured.map((row) => row.id),
  };
}

// ------------------------------------------------------------------ stored form

/** What CompetitorAnalysis.confidenceParts holds from version 2 on. */
export type StoredConfidence = {
  version: 2;
  basis: ConfidenceBasis | null;
  /** Set when the score was capped for lack of search evidence. */
  cappedAt?: number | null;
  measuredSignalCount: number;
  totalSignalCount: number;
  signals: ConfidenceSignal[];
  reason: string | null;
};

export function toStoredConfidence(result: CompetitorConfidence): StoredConfidence {
  return {
    version: 2,
    basis: result.basis,
    cappedAt: result.cappedAt,
    measuredSignalCount: result.measuredSignalCount,
    totalSignalCount: result.totalSignalCount,
    signals: result.signals,
    reason: result.reason,
  };
}

/**
 * Reads CompetitorAnalysis.confidenceParts in either stored form: version 2
 * (signals with evidence and reasons) or the original record of parts,
 * written before evidence was stored. Null when there is nothing usable.
 */
export function readStoredConfidence(value: unknown): StoredConfidence | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version === 2 && Array.isArray(raw.signals)) {
    return raw as unknown as StoredConfidence;
  }
  const signals: ConfidenceSignal[] = [];
  for (const id of CONFIDENCE_PART_IDS) {
    const part = raw[id] as Partial<Part> | undefined;
    const measured = Boolean(part && typeof part.weight === "number" && part.weight > 0);
    signals.push({
      id,
      label: CONFIDENCE_PART_LABELS[id],
      measured,
      weight: CONFIDENCE_WEIGHTS[id],
      appliedWeight: measured ? round(part!.weight!, 1) : 0,
      score: measured && typeof part!.raw === "number" ? part!.raw : null,
      points: measured && typeof part!.points === "number" ? round(part!.points, 1) : 0,
      evidence: null,
      reason: measured ? null : "Not measured when this analysis ran. Analyze the competitor again to measure it.",
    });
  }
  if (!signals.some((signal) => signal.measured) && !CONFIDENCE_PART_IDS.some((id) => id in raw)) return null;
  const measuredSignalCount = signals.filter((signal) => signal.measured).length;
  return {
    version: 2,
    basis: null,
    measuredSignalCount,
    totalSignalCount: signals.length,
    signals,
    reason: null,
  };
}
