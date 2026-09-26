import { describe, expect, it } from "vitest";
import {
  type ConfidenceInput,
  calculateCompetitorConfidence,
  readStoredConfidence,
  toStoredConfidence,
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

describe("calculateCompetitorConfidence", () => {
  const search = {
    queriesChecked: 8,
    appearanceCount: 6,
    sharedQueryCount: 3,
    selfAppearanceCount: 4,
    positions: [1, 2, 3, 5, 8, 12],
    top3: 3,
    top10: 5,
    top20: 6,
    bestPosition: 1,
    avgPosition: 5.2,
    meanRelevance: 0.85,
  };
  const business = { score: 0.8, reason: null, evidence: { sharedTerms: ["payment"] }, fromContent: true };
  const market = { score: 1, reason: null, evidence: { basis: "language" } };

  it("measures all six signals when every source is available", () => {
    const result = calculateCompetitorConfidence({ search, business, market, source: "serp", classificationConfidence: 0.9 });
    expect(result.measuredSignalCount).toBe(6);
    expect(result.totalSignalCount).toBe(6);
    expect(result.notMeasured).toEqual([]);
    expect(result.basis).toBe("search");
    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.confidenceBand).toBe("primary");
    const total = result.signals.reduce((sum, signal) => sum + signal.appliedWeight, 0);
    expect(total).toBeCloseTo(100, 0);
    expect(result.signals.find((signal) => signal.id === "rankingVisibility")?.evidence).toMatchObject({ top3: 3, top10: 5, top20: 6 });
  });

  it("redistributes weight over the measured signals and explains the rest", () => {
    const result = calculateCompetitorConfidence({
      search,
      business,
      market: { score: null, evidence: null, reason: "Your target market is not set and your site's language is unknown." },
      source: "manual",
      classificationConfidence: null,
    });
    expect(result.measuredSignalCount).toBe(5);
    expect(result.notMeasured).toEqual([{ id: "locationSimilarity", reason: "Your target market is not set and your site's language is unknown." }]);
    const measured = result.signals.filter((signal) => signal.measured);
    expect(measured.reduce((sum, signal) => sum + signal.appliedWeight, 0)).toBeCloseTo(100, 0);
  });

  it("gives every search signal the provider reason when no search provider is configured", () => {
    const reason = "No search provider is configured, so search results cannot be checked.";
    const result = calculateCompetitorConfidence({ search: null, searchUnavailableReason: reason, business, market, source: "manual", classificationConfidence: null });
    for (const id of ["queryCoverage", "rankingVisibility", "queryRelevance"]) {
      expect(result.signals.find((signal) => signal.id === id)).toMatchObject({ measured: false, reason });
    }
    // A manual competitor with measured business and market evidence still
    // gets a score, capped: without search evidence it is never "primary".
    expect(result.measuredSignalCount).toBe(3);
    expect(result.basis).toBe("business");
    expect(result.confidence).toBe(60);
    expect(result.cappedAt).toBe(60);
    expect(result.confidenceBand).toBe("secondary");
  });

  it("does not score without business context or search evidence", () => {
    const result = calculateCompetitorConfidence({
      search: null,
      business: { score: null, evidence: null, reason: "Not enough is known about your business.", fromContent: false },
      market,
      source: "manual",
      classificationConfidence: null,
    });
    expect(result.confidence).toBeNull();
    expect(result.basis).toBeNull();
    expect(result.reason).toMatch(/no evidence yet/);
    expect(result.signals.find((signal) => signal.id === "businessSimilarity")?.reason).toBe("Not enough is known about your business.");
  });

  it("measures nothing when nothing is known, with a reason on every signal", () => {
    const result = calculateCompetitorConfidence({
      search: null,
      business: { score: null, evidence: null, reason: "b", fromContent: false },
      market: { score: null, evidence: null, reason: "m" },
      source: "serp",
      classificationConfidence: null,
    });
    expect(result.measuredSignalCount).toBe(0);
    expect(result.confidence).toBeNull();
    expect(result.signals.every((signal) => typeof signal.reason === "string" && signal.reason.length > 0)).toBe(true);
  });

  it("treats a manual competitor as classified and an automatic one by its pages", () => {
    const manual = calculateCompetitorConfidence({ search, business, market, source: "manual", classificationConfidence: null });
    expect(manual.signals.find((signal) => signal.id === "classificationConfidence")).toMatchObject({ measured: true, score: 1 });
    const automatic = calculateCompetitorConfidence({ search, business, market, source: "serp", classificationConfidence: 0.4 });
    expect(automatic.signals.find((signal) => signal.id === "classificationConfidence")).toMatchObject({ measured: true, score: 0.4 });
  });

  it("explains a checked search the competitor never appeared in", () => {
    const absent = { ...search, appearanceCount: 0, sharedQueryCount: 0, positions: [], top3: 0, top10: 0, top20: 0, bestPosition: null, avgPosition: null, meanRelevance: null };
    const result = calculateCompetitorConfidence({ search: absent, business, market, source: "manual", classificationConfidence: null });
    expect(result.signals.find((signal) => signal.id === "queryCoverage")).toMatchObject({ measured: true, score: 0 });
    expect(result.signals.find((signal) => signal.id === "rankingVisibility")?.reason).toMatch(/Not found in the 8 searches checked/);
  });
});

describe("stored confidence", () => {
  it("round-trips the version 2 form", () => {
    const result = calculateCompetitorConfidence({
      search: null,
      business: { score: 0.7, evidence: null, reason: null, fromContent: true },
      market: { score: 1, evidence: null, reason: null },
      source: "manual",
      classificationConfidence: null,
    });
    const stored = readStoredConfidence(JSON.parse(JSON.stringify(toStoredConfidence(result))));
    expect(stored?.measuredSignalCount).toBe(3);
    expect(stored?.signals.find((signal) => signal.id === "queryCoverage")?.reason).toBeTruthy();
  });

  it("reads the original parts form, marking unmeasured signals for re-analysis", () => {
    const stored = readStoredConfidence({
      queryCoverage: { raw: 0, weight: 0, points: 0 },
      classificationConfidence: { raw: 1, weight: 100, points: 100 },
    });
    expect(stored?.measuredSignalCount).toBe(1);
    expect(stored?.signals.find((signal) => signal.id === "queryCoverage")?.reason).toMatch(/Analyze the competitor again/);
    expect(readStoredConfidence(null)).toBeNull();
  });
});
