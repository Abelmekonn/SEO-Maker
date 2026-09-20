import { describe, expect, it } from "vitest";
import type { AuditablePage } from "./page-audit";
import { SEO_WEIGHTS, weightedSeoScore } from "./seo-score";

function page(overrides: Partial<AuditablePage> = {}): AuditablePage {
  return {
    status: "analyzed",
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    statusCode: 200,
    title: "A reasonably sized page title for testing",
    metaDesc:
      "A meta description that sits comfortably inside the recommended range of characters for search results.",
    h1: "A heading",
    h2Count: 2,
    canonicalUrl: "https://example.com/",
    imageCount: 2,
    missingAlt: 0,
    internalLinks: 20,
    wordCount: 800,
    schemaCount: 1,
    robotsOk: true,
    hasSitemap: true,
    indexable: true,
    ...overrides,
  };
}

describe("weightedSeoScore", () => {
  it("scores a healthy site highly across every dimension", () => {
    const result = weightedSeoScore({ pages: [page(), page()], performanceScore: 95 });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.band).toBe("excellent");
    expect(result.notMeasured).toEqual([]);
  });

  it("excludes performance when it was not measured, instead of scoring it zero", () => {
    const pages = [page(), page()];
    const withoutPerf = weightedSeoScore({ pages });
    const withZeroPerf = weightedSeoScore({ pages, performanceScore: 0 });

    expect(withoutPerf.notMeasured).toEqual(["performance"]);
    expect(withoutPerf.dimensions.performance).toBeNull();
    // The regression this guards: an unmeasured dimension must not cost points.
    expect(withoutPerf.score!).toBeGreaterThan(withZeroPerf.score!);
    expect(withoutPerf.score! - withZeroPerf.score!).toBeGreaterThanOrEqual(13);
  });

  it("redistributes the missing weight so the applied weights still total 100", () => {
    const result = weightedSeoScore({ pages: [page()] });
    const total = Object.values(result.weights).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(100, 10);
    expect(result.weights.performance).toBe(0);
    // technical keeps its share of the 15 points performance gave up
    expect(result.weights.technical).toBeGreaterThan(SEO_WEIGHTS.technical);
  });

  it("measures structured data as the share of pages carrying schema", () => {
    const result = weightedSeoScore({
      pages: [page({ schemaCount: 1 }), page({ schemaCount: 0 }), page({ schemaCount: 1 })],
    });
    expect(result.dimensions.structuredData).toBe(67);
  });

  it("reports structured data as unmeasured when no page reported it", () => {
    const result = weightedSeoScore({ pages: [page({ schemaCount: null })] });
    expect(result.dimensions.structuredData).toBeNull();
    expect(result.notMeasured).toContain("structuredData");
  });

  it("returns a null score when there is nothing to score", () => {
    const result = weightedSeoScore({ pages: [] });
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
    expect(result.notMeasured).toHaveLength(6);
  });

  it("ignores pages that have not been crawled", () => {
    const crawledOnly = weightedSeoScore({ pages: [page()] });
    const withPending = weightedSeoScore({ pages: [page(), page({ status: "pending" })] });
    expect(withPending.score).toBe(crawledOnly.score);
  });

  it("rewards deeper content up to the target length", () => {
    const thin = weightedSeoScore({ pages: [page({ wordCount: 100 })] });
    const deep = weightedSeoScore({ pages: [page({ wordCount: 800 })] });
    expect(deep.dimensions.content!).toBeGreaterThan(thin.dimensions.content!);
  });

  it("maps score onto the SEO band vocabulary, distinct from the other scores", () => {
    expect(weightedSeoScore({ pages: [page()], performanceScore: 95 }).band).toBe("excellent");
    expect(
      weightedSeoScore({
        pages: [
          page({
            statusCode: 500,
            title: null,
            metaDesc: null,
            h1: null,
            h2Count: 0,
            canonicalUrl: null,
            missingAlt: 4,
            internalLinks: 0,
            wordCount: 20,
            schemaCount: 0,
            indexable: false,
            robotsOk: false,
            hasSitemap: false,
          }),
        ],
        performanceScore: 5,
      }).band,
    ).toBe("poor");
  });
});
