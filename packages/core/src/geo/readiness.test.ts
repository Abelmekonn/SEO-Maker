import { describe, expect, it } from "vitest";
import type { GeoDimensionId } from "./types";
import { GEO_WEIGHTS, computeReadiness } from "./readiness";

function measured(overrides: Partial<Record<GeoDimensionId, number | null>> = {}) {
  return {
    entityClarity: 1,
    contentExtractability: 1,
    answerCoverage: 1,
    structuredData: 1,
    aiCrawlerAccess: 1,
    citationReadiness: 1,
    businessInfo: 1,
    ...overrides,
  } as Record<GeoDimensionId, number | null>;
}

describe("GEO_WEIGHTS", () => {
  it("sums to 100", () => {
    const total = Object.values(GEO_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBe(100);
  });
});

describe("computeReadiness", () => {
  it("scores a perfect site at 100 with full coverage", () => {
    const result = computeReadiness(measured());
    expect(result.score).toBe(100);
    expect(result.band).toBe("ready");
    expect(result.coverage).toBe(1);
    expect(result.notMeasured).toEqual([]);
  });

  // The regression this exists to prevent: a dimension nobody could measure
  // must not behave like a dimension that scored zero.
  it("redistributes an unmeasured dimension instead of scoring it zero", () => {
    const unmeasured = computeReadiness(measured({ answerCoverage: null }));
    const zeroed = computeReadiness(measured({ answerCoverage: 0 }));

    expect(unmeasured.score).toBe(100);
    expect(zeroed.score).toBe(85);
    expect(unmeasured.notMeasured).toEqual(["answerCoverage"]);
  });

  it("reports coverage so a score built from one signal is not read as seven", () => {
    const result = computeReadiness(
      measured({
        entityClarity: null,
        contentExtractability: null,
        answerCoverage: null,
        structuredData: null,
        citationReadiness: null,
        businessInfo: null,
      }),
    );
    expect(result.score).toBe(100);
    expect(result.coverage).toBe(0.15);
    expect(result.notMeasured).toHaveLength(6);
  });

  it("returns a null score and band when nothing was measurable", () => {
    const result = computeReadiness(
      measured({
        entityClarity: null,
        contentExtractability: null,
        answerCoverage: null,
        structuredData: null,
        aiCrawlerAccess: null,
        citationReadiness: null,
        businessInfo: null,
      }),
    );
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
    expect(result.coverage).toBe(0);
  });

  it("bands on the documented boundaries", () => {
    const at = (value: number) =>
      computeReadiness({
        entityClarity: value / 100,
        contentExtractability: null,
        answerCoverage: null,
        structuredData: null,
        aiCrawlerAccess: null,
        citationReadiness: null,
        businessInfo: null,
      }).band;

    expect(at(80)).toBe("ready");
    expect(at(79)).toBe("emerging");
    expect(at(60)).toBe("emerging");
    expect(at(59)).toBe("limited");
    expect(at(35)).toBe("limited");
    expect(at(34)).toBe("unprepared");
  });

  it("keeps only the reasons for dimensions that really are unmeasured", () => {
    const result = computeReadiness(measured({ answerCoverage: null }), [
      { dimension: "answerCoverage", reason: "No questions were generated." },
      { dimension: "entityClarity", reason: "stale reason from an earlier run" },
    ]);
    expect(result.reasons).toEqual([
      { dimension: "answerCoverage", reason: "No questions were generated." },
    ]);
  });

  it("exposes post-redistribution weights so the score can be audited", () => {
    const result = computeReadiness(measured({ answerCoverage: null }));
    const total = Object.values(result.weights).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(result.weights.answerCoverage).toBe(0);
    expect(result.weights.entityClarity).toBeGreaterThan(GEO_WEIGHTS.entityClarity);
  });
});
