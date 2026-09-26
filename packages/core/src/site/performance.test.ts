import { describe, expect, it } from "vitest";
import { type PerformanceRunInput, metricBand, summarizePerformance } from "./performance";
import { containment, overlap, termSet, titleTopic, tokenize } from "./terms";

function run(overrides: Partial<PerformanceRunInput> = {}): PerformanceRunInput {
  return {
    pageKey: "x.com",
    strategy: "mobile",
    performance: 80,
    lcp: 2,
    cls: 0.05,
    tbt: 150,
    inp: null,
    opportunities: [],
    createdAt: new Date("2026-09-01"),
    ...overrides,
  };
}

describe("summarizePerformance", () => {
  it("is null when PageSpeed never ran", () => {
    expect(summarizePerformance([])).toBeNull();
  });

  it("uses only the newest run per page and device", () => {
    const summary = summarizePerformance([
      run({ lcp: 6, createdAt: new Date("2026-08-01") }),
      run({ lcp: 2, createdAt: new Date("2026-09-01") }),
    ]);
    expect(summary?.mobile?.lcp).toMatchObject({ measured: 1, good: 1, poor: 0 });
  });

  it("bands metrics at the published Core Web Vitals thresholds", () => {
    expect(metricBand("lcp", 2.5)).toBe("good");
    expect(metricBand("lcp", 3)).toBe("needs-improvement");
    expect(metricBand("lcp", 4.1)).toBe("poor");
    expect(metricBand("cls", 0.3)).toBe("poor");
    expect(metricBand("tbt", 700)).toBe("poor");
  });

  it("aggregates Lighthouse opportunities across pages, mobile first", () => {
    const audit = (savingsMs: number) => [{ id: "unused-javascript", title: "Reduce unused JavaScript", savingsMs }];
    const summary = summarizePerformance([
      run({ pageKey: "x.com", opportunities: audit(600) }),
      run({ pageKey: "x.com/a", opportunities: audit(400) }),
      run({ pageKey: "x.com", strategy: "desktop", opportunities: audit(5000) }),
    ]);
    expect(summary?.topAudits).toEqual([
      { id: "unused-javascript", title: "Reduce unused JavaScript", pages: 2, totalSavingsMs: 1000, pageKeys: ["x.com", "x.com/a"] },
    ]);
    expect(summary?.pagesMeasured).toBe(2);
  });

  it("carries no raw Lighthouse payload", () => {
    const summary = summarizePerformance([run({ opportunities: [{ id: "a", title: "A", savingsMs: 10, description: "long text" }] })]);
    expect(JSON.stringify(summary)).not.toContain("long text");
  });
});

describe("terms", () => {
  it("drops stopwords and web boilerplate, and folds plurals", () => {
    expect(tokenize("Learn more about our Payments and Invoices")).toEqual(["payment", "invoice"]);
  });

  it("strips a brand suffix from a title", () => {
    expect(titleTopic("Payments | Stripe")).toBe("Payments");
    expect(titleTopic("Online payments - Accept cards - Stripe")).toBe("Online payments - Accept cards");
    expect(titleTopic("No separator here")).toBe("No separator here");
  });

  it("measures overlap and containment", () => {
    const a = termSet("invoice templates");
    const b = termSet("free invoice templates for freelancers");
    expect(containment(a, b)).toBe(1);
    expect(overlap(a, b)).toBeCloseTo(2 / 3, 5);
    expect(containment(new Set(), b)).toBe(0);
  });
});
