import { describe, expect, it } from "vitest";
import { buildSiteIntelligence } from "../site/intelligence";
import { sitePage } from "../site/test-fixtures";
import { type CompetitorPageInput, aggregateContentGaps, compareWithCompetitor } from "./compare";

const self = buildSiteIntelligence({
  rootUrl: "https://me.com",
  pages: [
    sitePage({ url: "https://me.com/", depth: 0, title: "Me", internalLinks: 10 }),
    sitePage({
      url: "https://me.com/services/bookkeeping",
      pageType: "service",
      title: "Bookkeeping services | Me",
      h1: "Bookkeeping for small businesses",
      wordCount: 400,
      internalLinks: 10,
      schema: ["Service"],
    }),
  ],
});

function theirPage(overrides: Partial<CompetitorPageInput> = {}): CompetitorPageInput {
  return {
    url: "https://them.com/x",
    title: null,
    h1: null,
    wordCount: 800,
    internalLinks: 40,
    pageType: null,
    schemaTypes: [],
    headings: [],
    ...overrides,
  };
}

const theirs = [
  theirPage({ url: "https://them.com/", pageType: "homepage", h1: "Them" }),
  theirPage({ url: "https://them.com/services/bookkeeping", pageType: "service", h1: "Bookkeeping for small businesses", wordCount: 1500, schemaTypes: ["Service", "FAQPage"] }),
  theirPage({ url: "https://them.com/services/payroll", pageType: "service", h1: "Payroll processing", wordCount: 1300 }),
  theirPage({ url: "https://them.com/pricing", pageType: "pricing", h1: "Pricing plans", schemaTypes: ["FAQPage"] }),
];

describe("compareWithCompetitor", () => {
  const comparison = compareWithCompetitor({ domain: "them.com", self, competitorPages: theirs });
  const ids = comparison.facts.map((fact) => fact.id);

  it("reports a topic you do not cover, and not one you do", () => {
    expect(comparison.topicGaps.map((gap) => gap.topic)).toEqual(["Payroll processing", "Pricing plans"]);
  });

  it("states page-type and structured-data differences as facts with stable ids", () => {
    expect(ids).toContain("pt:pricing");
    expect(ids).toContain("sd:FAQPage");
    expect(ids).not.toContain("sd:Service");
  });

  it("compares depth only on page types both sides have", () => {
    expect(comparison.depth).toEqual([
      { pageType: "service", selfAvgWords: 400, competitorAvgWords: 1400, selfPages: 1, competitorPages: 2 },
    ]);
    expect(comparison.facts.find((fact) => fact.id === "depth:service")?.favours).toBe("competitor");
  });

  it("compares internal linking", () => {
    expect(comparison.facts.find((fact) => fact.id === "links:avg")?.statement).toContain("40 internal links on average; yours carry 10");
  });

  it("claims no keyword gaps without search results, and says so", () => {
    expect(comparison.keywordGaps).toEqual([]);
    expect(comparison.limits[0]).toContain("No search results data");
  });

  it("uses search results when a provider supplied them", () => {
    const withSerp = compareWithCompetitor({
      domain: "them.com",
      self,
      competitorPages: theirs,
      serp: [
        { query: "payroll software", competitorPosition: 3, selfPosition: null, searchVolume: 900 },
        { query: "bookkeeping", competitorPosition: 5, selfPosition: 2, searchVolume: 400 },
      ],
    });
    expect(withSerp.keywordGaps.map((row) => row.query)).toEqual(["payroll software"]);
    expect(withSerp.facts.find((fact) => fact.id === "kw:1")?.statement).toContain("you were not found");
  });
});

describe("aggregateContentGaps", () => {
  const a = compareWithCompetitor({ domain: "them.com", self, competitorPages: theirs });
  const b = compareWithCompetitor({
    domain: "other.com",
    self,
    competitorPages: [theirPage({ url: "https://other.com/payroll", pageType: "service", h1: "Payroll processing for teams", wordCount: 900 })],
  });

  it("merges the same gap across competitors and counts them", () => {
    const gaps = aggregateContentGaps({
      comparisons: [
        { competitorId: "c1", comparison: a },
        { competitorId: "c2", comparison: b },
      ],
      self,
      business: null,
    });
    const payroll = gaps.find((gap) => gap.kind === "topic" && /payroll/i.test(gap.title));
    expect(payroll?.competitorIds).toEqual(["c1", "c2"]);
    expect(gaps[0]).toBe(payroll);
  });

  it("leaves relevance unmeasured without business context, rather than assuming it", () => {
    const gaps = aggregateContentGaps({ comparisons: [{ competitorId: "c1", comparison: a }], self, business: null });
    expect(gaps.every((gap) => gap.relevance === null)).toBe(true);
    expect(gaps[0].opportunity.notMeasured).toContain("relevance");
  });

  it("scores a gap that matches the business above one that does not", () => {
    const gaps = aggregateContentGaps({
      comparisons: [{ competitorId: "c1", comparison: a }],
      self,
      business: { offerings: ["Payroll"], targetKeywords: [], description: null, audience: null, industry: "accounting" },
    });
    const payroll = gaps.find((gap) => /payroll/i.test(gap.title))!;
    const pricing = gaps.find((gap) => gap.kind === "topic" && /pricing/i.test(gap.title))!;
    // "Payroll processing": the business names one of its two topic words.
    expect(payroll.relevance).toBe(0.5);
    expect(pricing.relevance).toBe(0);
    expect(payroll.opportunity.score!).toBeGreaterThan(pricing.opportunity.score!);
  });
});
