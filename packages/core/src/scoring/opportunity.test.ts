import { describe, expect, it } from "vitest";
import { type OpportunityInput, opportunityScore, searchSignal } from "./opportunity";

function input(overrides: Partial<OpportunityInput> = {}): OpportunityInput {
  return {
    relevance: 0.9,
    competitorsCovering: 4,
    competitorsTotal: 5,
    selfCoverage: 0,
    searchVolume: 1000,
    difficulty: 40,
    businessValue: 0.7,
    ...overrides,
  };
}

describe("searchSignal", () => {
  it("is unmeasured without volume, which is the no-SERP-provider path", () => {
    expect(searchSignal(null, null)).toBeNull();
    expect(searchSignal(null, 40)).toBeNull();
  });

  it("log-scales volume and saturates around ten thousand", () => {
    const low = searchSignal(10, null)!;
    const mid = searchSignal(1000, null)!;
    const high = searchSignal(10000, null)!;
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeCloseTo(1, 2);
  });

  it("never discounts by more than half for difficulty", () => {
    const easy = searchSignal(1000, 0)!;
    const brutal = searchSignal(1000, 100)!;
    expect(brutal).toBeCloseTo(easy * 0.5, 10);
  });

  it("clamps out-of-range difficulty", () => {
    expect(searchSignal(1000, 500)).toBeCloseTo(searchSignal(1000, 100)!, 10);
  });
});

describe("opportunityScore", () => {
  it("scores a wide-open, highly relevant gap as critical", () => {
    const result = opportunityScore(
      input({ relevance: 1, competitorsCovering: 5, competitorsTotal: 5, selfCoverage: 0 }),
    );
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.band).toBe("critical");
  });

  it("scores an already-covered, irrelevant topic as low", () => {
    const result = opportunityScore(
      input({
        relevance: 0.05,
        competitorsCovering: 1,
        competitorsTotal: 5,
        selfCoverage: 1,
        searchVolume: 10,
        businessValue: 0.1,
      }),
    );
    expect(result.score).toBeLessThan(35);
    expect(result.band).toBe("low");
  });

  it("redistributes the search weight when no provider supplied volume", () => {
    const result = opportunityScore(input({ searchVolume: null, difficulty: null }));
    expect(result.notMeasured).toEqual(["searchSignal"]);
    expect(result.weights.searchSignal).toBe(0);
    const total = Object.values(result.weights).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(100, 10);
    // 30/25/20/10 renormalized over 85
    expect(result.weights.relevance).toBeCloseTo((30 * 100) / 85, 6);
  });

  it("does not penalize a gap for missing search data", () => {
    const unknown = opportunityScore(input({ searchVolume: null, difficulty: null }));
    const zeroish = opportunityScore(input({ searchVolume: 0, difficulty: null }));
    expect(unknown.score!).toBeGreaterThan(zeroish.score!);
  });

  it("treats full self-coverage as no remaining gap", () => {
    const covered = opportunityScore(input({ selfCoverage: 1 }));
    const open = opportunityScore(input({ selfCoverage: 0 }));
    expect(covered.parts.currentGap.raw).toBe(0);
    expect(open.parts.currentGap.raw).toBe(1);
    expect(open.score!).toBeGreaterThan(covered.score!);
  });

  it("is unmeasured for coverage when there are no competitors yet", () => {
    const result = opportunityScore(input({ competitorsCovering: 0, competitorsTotal: 0 }));
    expect(result.notMeasured).toContain("competitorCoverage");
  });

  it("uses a band vocabulary distinct from confidence and SEO scores", () => {
    const bands = [100, 80, 60, 40, 10].map(
      (relevance) => opportunityScore(input({ relevance: relevance / 100 })).band,
    );
    for (const band of bands) {
      expect(band).toMatch(/^(critical|high|medium|low)$/);
    }
  });
});
