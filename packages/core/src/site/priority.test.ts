import { describe, expect, it } from "vitest";
import { type PriorityInput, combinedImportance, reach, sitePriority } from "./priority";

function input(overrides: Partial<PriorityInput> = {}): PriorityInput {
  return {
    severity: "medium",
    affectedPages: 10,
    totalPages: 100,
    importance: [0.5],
    indexabilityImpact: 0,
    performanceImpact: 0,
    effort: "medium",
    confidence: 1,
    ...overrides,
  };
}

describe("sitePriority", () => {
  it("ranks an indexing blocker on key pages above a site-wide snippet problem above one missing H2", () => {
    const blocker = sitePriority(
      input({ severity: "critical", affectedPages: 3, importance: [0.9, 0.6, 0.3], indexabilityImpact: 1, effort: "low" }),
    );
    const meta = sitePriority(input({ severity: "high", affectedPages: 100, importance: [1, 0.4, 0.3] }));
    const h2 = sitePriority(input({ severity: "low", affectedPages: 1, importance: [0.3], effort: "low", confidence: 0.7 }));

    expect(blocker.score).toBeGreaterThan(meta.score);
    expect(meta.score).toBeGreaterThan(h2.score);
    expect(h2.band).toBe("low");
  });

  it("is reproducible", () => {
    expect(sitePriority(input())).toEqual(sitePriority(input()));
  });

  it("spreads the importance weight when a finding is not tied to pages", () => {
    const result = sitePriority(input({ importance: null }));
    expect(result.notMeasured).toEqual(["importance"]);
    expect(result.weights.importance).toBe(0);
    const total = Object.values(result.weights).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(100, 10);
  });

  it("keeps its parts, so a score can be audited", () => {
    const result = sitePriority(input());
    const points = Object.values(result.parts).reduce((sum, part) => sum + part.points, 0);
    expect(Math.round(points)).toBe(result.score);
  });

  it("uses the opportunity band vocabulary", () => {
    for (const severity of ["critical", "high", "medium", "low"] as const) {
      expect(sitePriority(input({ severity })).band).toMatch(/^(critical|high|medium|low)$/);
    }
  });

  it("rewards less effort and more confidence, all else equal", () => {
    expect(sitePriority(input({ effort: "low" })).score).toBeGreaterThan(sitePriority(input({ effort: "high" })).score);
    expect(sitePriority(input({ confidence: 1 })).score).toBeGreaterThan(sitePriority(input({ confidence: 0.3 })).score);
  });
});

describe("reach and importance", () => {
  it("grows with the share of the site affected, sub-linearly", () => {
    expect(reach(0, 100)).toBe(0);
    expect(reach(100, 100)).toBe(1);
    expect(reach(4, 100)).toBeCloseTo(0.2, 5);
  });

  it("never exceeds 1 when more pages are affected than counted", () => {
    expect(reach(12, 10)).toBe(1);
  });

  it("weights the most important affected page most", () => {
    expect(combinedImportance([1, 0.1, 0.1])).toBeGreaterThan(combinedImportance([0.4, 0.4, 0.4]));
    expect(combinedImportance([])).toBe(0);
  });
});
