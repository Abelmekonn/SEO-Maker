/**
 * One weighted component of a composite score.
 * `weight` is the weight AFTER redistribution, so the parts always sum to the score.
 */
export type Part = { raw: number; weight: number; points: number };

export type WeightedResult<K extends string> = {
  /** 0-100, or null when nothing at all could be measured. */
  score: number | null;
  weights: Record<K, number>;
  notMeasured: K[];
  parts: Record<K, Part>;
};

/**
 * Combines 0..1 measurements into a 0-100 score.
 *
 * A `null` measurement is dropped and its weight is spread proportionally across
 * the dimensions that *were* measured. An unmeasured dimension is never treated
 * as a zero — scoring a site 0 for a check we simply did not run is the single
 * most misleading thing this system could do.
 */
export function redistribute<K extends string>(
  weights: Record<K, number>,
  measured: Record<K, number | null>,
): WeightedResult<K> {
  const keys = Object.keys(weights) as K[];
  const notMeasured = keys.filter((key) => measured[key] == null);
  const remaining = keys.filter((key) => measured[key] != null);
  const totalWeight = remaining.reduce((sum, key) => sum + weights[key], 0);

  const parts = {} as Record<K, Part>;
  const applied = {} as Record<K, number>;

  if (totalWeight === 0) {
    for (const key of keys) {
      applied[key] = 0;
      parts[key] = { raw: 0, weight: 0, points: 0 };
    }
    return { score: null, weights: applied, notMeasured, parts };
  }

  let score = 0;
  for (const key of keys) {
    const raw = measured[key];
    if (raw == null) {
      applied[key] = 0;
      parts[key] = { raw: 0, weight: 0, points: 0 };
      continue;
    }
    const weight = (weights[key] * 100) / totalWeight;
    const points = raw * weight;
    applied[key] = weight;
    parts[key] = { raw, weight, points };
    score += points;
  }

  return { score: Math.round(score), weights: applied, notMeasured, parts };
}
