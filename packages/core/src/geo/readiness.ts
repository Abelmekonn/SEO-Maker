/**
 * AI Search Readiness — the composite.
 *
 * Deliberately a plain weighted sum over seven measured dimensions, computed by
 * the same `redistribute` the SEO and competitor scores use. No model produces
 * any part of this number, and every component is stored alongside it so the UI
 * can show exactly why the score is what it is.
 *
 * It is a diagnostic of preparedness. It is not a ranking score, and it does
 * not predict whether any assistant will cite the site.
 */

import { type GeoReadinessBand, geoReadinessBand } from "../scoring/bands";
import { type WeightedResult, redistribute } from "../scoring/weights";
import type { GeoDimensionId, NotMeasuredReason } from "./types";

export const GEO_WEIGHTS: Record<GeoDimensionId, number> = {
  entityClarity: 20,
  contentExtractability: 15,
  answerCoverage: 15,
  structuredData: 15,
  aiCrawlerAccess: 15,
  citationReadiness: 10,
  businessInfo: 10,
};

export type GeoReadinessResult = WeightedResult<GeoDimensionId> & {
  band: GeoReadinessBand | null;
  /**
   * Share of the original weight that was actually measured, 0..1.
   *
   * `redistribute` will happily return 100 from a single measured dimension,
   * which is correct arithmetic and a misleading headline. This is what the UI
   * shows beside the score so a number built from one signal cannot read like a
   * number built from seven.
   */
  coverage: number;
  reasons: NotMeasuredReason[];
};

export function computeReadiness(
  measured: Record<GeoDimensionId, number | null>,
  reasons: NotMeasuredReason[] = [],
): GeoReadinessResult {
  const result = redistribute(GEO_WEIGHTS, measured);

  const measuredWeight = (Object.keys(GEO_WEIGHTS) as GeoDimensionId[])
    .filter((id) => measured[id] != null)
    .reduce((sum, id) => sum + GEO_WEIGHTS[id], 0);

  return {
    ...result,
    band: result.score == null ? null : geoReadinessBand(result.score),
    coverage: measuredWeight / 100,
    // Only keep reasons for dimensions that really were not measured, so a
    // stale reason cannot appear next to a scored dimension.
    reasons: reasons.filter((reason) => measured[reason.dimension] == null),
  };
}
