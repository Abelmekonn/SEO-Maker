import { describe, expect, it } from "vitest";
import {
  type ConfidenceInput,
  businessSimilarity,
  competitorConfidence,
  locationSimilarity,
  positionVisibility,
  queryCoverage,
} from "./confidence";

function input(overrides: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    sharedQueries: 8,
    totalQueries: 16,
    positions: [3, 4, 5],
    queryRelevance: 0.8,
    businessType: "agency",
    selfBusinessType: "agency",
    country: "us",
    language: "en",
    selfCountry: "us",
    selfLanguage: "en",
    source: "serp",
    classificationConfidence: 0.9,
    ...overrides,
  };
}

describe("queryCoverage", () => {
  it("saturates at half of the tracked queries", () => {
    expect(queryCoverage(5, 10)).toBe(1);
    expect(queryCoverage(8, 10)).toBe(1);
  });

  it("scales linearly below the saturation point", () => {
    expect(queryCoverage(1, 10)).toBeCloseTo(0.2, 10);
    expect(queryCoverage(2, 10)).toBeCloseTo(0.4, 10);
  });

  it("is unmeasured when no queries were tracked", () => {
    expect(queryCoverage(0, 0)).toBeNull();
  });
});

describe("positionVisibility", () => {
  it("gives the top spot full visibility", () => {
    expect(positionVisibility(1)).toBe(1);
    expect(positionVisibility(2)).toBe(0.5);
  });

  it("decreases monotonically", () => {
    const values = [1, 2, 3, 5, 10, 20, 50, 100].map(positionVisibility);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it("stays positive even deep in the results", () => {
    expect(positionVisibility(100)).toBeGreaterThan(0);
    expect(positionVisibility(100)).toBeCloseTo(0.131, 2);
  });

  it("clamps nonsensical positions to the top spot", () => {
    expect(positionVisibility(0)).toBe(1);
  });
});

describe("businessSimilarity", () => {
  it("scores an exact type match highest", () => {
    expect(businessSimilarity("saas", "saas")).toBe(1);
  });

  it("scores a shared family in between", () => {
    expect(businessSimilarity("saas", "marketplace")).toBe(0.6);
    expect(businessSimilarity("blog", "media")).toBe(0.6);
  });

  it("scores unrelated known types low", () => {
    expect(businessSimilarity("saas", "blog")).toBe(0.25);
  });

  it("is unmeasured when either side is unknown or generic", () => {
    expect(businessSimilarity(null, "saas")).toBeNull();
    expect(businessSimilarity("other", "saas")).toBeNull();
    expect(businessSimilarity("saas", "not-a-type")).toBeNull();
  });
});

describe("locationSimilarity", () => {
  it("ranks country+language above language above country", () => {
    expect(locationSimilarity("us", "en", "us", "en")).toBe(1);
    expect(locationSimilarity("gb", "en", "us", "en")).toBe(0.7);
    expect(locationSimilarity("us", "es", "us", "en")).toBe(0.4);
    expect(locationSimilarity("fr", "fr", "us", "en")).toBe(0.1);
  });

  it("ignores case", () => {
    expect(locationSimilarity("US", "EN", "us", "en")).toBe(1);
  });

  it("is unmeasured when a side has neither signal", () => {
    expect(locationSimilarity(null, null, "us", "en")).toBeNull();
    expect(locationSimilarity("us", "en", null, null)).toBeNull();
  });
});

describe("competitorConfidence", () => {
  it("scores a strong, well-identified competitor highly", () => {
    const result = competitorConfidence(
      input({ sharedQueries: 11, totalQueries: 15, positions: [1, 2, 3, 2, 4] }),
    );
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.band).toBe("primary");
    expect(result.notMeasured).toEqual([]);
  });

  it("scores a weak, barely-overlapping domain low", () => {
    const result = competitorConfidence(
      input({
        sharedQueries: 1,
        totalQueries: 20,
        positions: [48],
        queryRelevance: 0.1,
        businessType: "blog",
        selfBusinessType: "saas",
        country: "jp",
        language: "ja",
        classificationConfidence: 0.3,
      }),
    );
    expect(result.score).toBeLessThan(25);
    expect(result.band).toBe("unrelated");
  });

  it("treats a manually added competitor as fully classified", () => {
    const result = competitorConfidence(input({ source: "manual", classificationConfidence: null }));
    expect(result.parts.classificationConfidence.raw).toBe(1);
    expect(result.notMeasured).not.toContain("classificationConfidence");
  });

  it("redistributes weight when business and location are unknown", () => {
    const result = competitorConfidence(
      input({
        businessType: null,
        selfBusinessType: null,
        country: null,
        language: null,
        selfCountry: null,
        selfLanguage: null,
      }),
    );
    expect(result.notMeasured.sort()).toEqual(["businessSimilarity", "locationSimilarity"]);
    const total = Object.values(result.weights).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(100, 10);
  });

  it("does not punish a competitor for signals we could not measure", () => {
    const unknown = competitorConfidence(input({ businessType: null, selfBusinessType: null }));
    const mismatched = competitorConfidence(
      input({ businessType: "blog", selfBusinessType: "saas" }),
    );
    expect(unknown.score!).toBeGreaterThan(mismatched.score!);
  });

  it("returns null rather than a fabricated score when nothing is known", () => {
    const result = competitorConfidence(
      input({
        sharedQueries: 0,
        totalQueries: 0,
        positions: [],
        queryRelevance: null,
        businessType: null,
        selfBusinessType: null,
        country: null,
        language: null,
        selfCountry: null,
        selfLanguage: null,
        source: "serp",
        classificationConfidence: null,
      }),
    );
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
  });

  it("refuses to score a manual competitor that has no search evidence", () => {
    // Regression: a hand-added competitor used to score 100/primary purely
    // because classificationConfidence was the only measured signal.
    const result = competitorConfidence(
      input({
        source: "manual",
        sharedQueries: 0,
        totalQueries: 0,
        positions: [],
        queryRelevance: null,
        businessType: null,
        selfBusinessType: null,
        country: null,
        language: null,
        selfCountry: null,
        selfLanguage: null,
        classificationConfidence: null,
      }),
    );
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
  });

  it("scores once any real search evidence exists", () => {
    const result = competitorConfidence(
      input({
        source: "manual",
        sharedQueries: 3,
        totalQueries: 10,
        positions: [4],
        queryRelevance: null,
        businessType: null,
        selfBusinessType: null,
        country: null,
        language: null,
        selfCountry: null,
        selfLanguage: null,
        classificationConfidence: null,
      }),
    );
    expect(result.score).not.toBeNull();
    expect(result.band).not.toBeNull();
  });

  it("maps scores onto the confidence band vocabulary", () => {
    expect(competitorConfidence(input()).band).toMatch(
      /^(primary|secondary|peripheral|unrelated)$/,
    );
  });
});
