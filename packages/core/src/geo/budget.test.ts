import { describe, expect, it } from "vitest";
import {
  PAGE_TOKEN_CEILING,
  PAGE_TOKEN_FLOOR,
  SITE_TOKEN_BUDGET,
  allocateBudget,
  estimateTokens,
  packPage,
  packPageEvidence,
  type PackablePage,
} from "./budget";

function page(overrides: Partial<PackablePage> = {}): PackablePage {
  return {
    id: "p1",
    url: "https://example.com/",
    pageType: "homepage",
    title: "Example — web design studio",
    h1: "We build websites",
    metaDesc: "A web design studio in Addis Ababa.",
    content: "We build websites for small businesses. ".repeat(40),
    headings: [
      { level: 2, text: "What we do" },
      { level: 2, text: "Where we work" },
    ],
    schema: [{ types: ["Organization"], data: {}, valid: true, error: null }],
    importance: 80,
    ...overrides,
  };
}

describe("estimateTokens", () => {
  it("is zero for empty input and grows with length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(370))).toBe(100);
  });
});

describe("allocateBudget", () => {
  it("gives a more important page a larger share", () => {
    const pages = [page({ id: "a", importance: 90 }), page({ id: "b", importance: 10 })];
    const allocation = allocateBudget(pages, 10_000);
    expect(allocation.get("a")!).toBeGreaterThan(allocation.get("b")!);
  });

  it("clamps every allocation to the floor and ceiling", () => {
    const pages = [page({ id: "a", importance: 100 }), page({ id: "b", importance: 1 })];
    const allocation = allocateBudget(pages, 100_000);
    for (const value of allocation.values()) {
      expect(value).toBeGreaterThanOrEqual(PAGE_TOKEN_FLOOR);
      expect(value).toBeLessThanOrEqual(PAGE_TOKEN_CEILING);
    }
  });

  it("returns nothing when there are no pages", () => {
    expect(allocateBudget([], 10_000).size).toBe(0);
  });
});

describe("packPage", () => {
  it("writes identity fields before prose", () => {
    const text = packPage(page(), 2_000);
    const lines = text.split("\n");
    expect(lines[0]).toBe("URL: https://example.com/");
    expect(lines[1]).toBe("Type: homepage");
    expect(text).toContain("Schema types: Organization");
  });

  // A half-written field is what makes a model invent the rest, so a tight
  // budget must drop whole lines rather than cut one open.
  it("drops whole fields under a tight budget, never partial ones", () => {
    const text = packPage(page(), 8);
    expect(text).toBe("URL: https://example.com/");
    expect(text).not.toContain("Lead:");
  });
});

describe("packPageEvidence", () => {
  it("subtracts the knowledge block before packing pages", () => {
    const pages = [page({ id: "a" }), page({ id: "b" })];
    const ungrounded = packPageEvidence({ pages, mode: "quick", knowledgeTokens: 0 });
    const grounded = packPageEvidence({ pages, mode: "quick", knowledgeTokens: 5_000 });

    expect(ungrounded.tokensAvailable).toBe(SITE_TOKEN_BUDGET.quick);
    expect(grounded.tokensAvailable).toBe(SITE_TOKEN_BUDGET.quick - 5_000);
  });

  it("packs in importance order", () => {
    const result = packPageEvidence({
      pages: [page({ id: "low", importance: 10 }), page({ id: "high", importance: 95 })],
      mode: "quick",
      knowledgeTokens: 0,
    });
    expect(result.packed.map((entry) => entry.id)).toEqual(["high", "low"]);
  });

  // Dropped pages have to stay visible: "we did not look at these" is a fact
  // the user is entitled to see, and it is also what the UI lists.
  it("defers pages that do not fit and records why", () => {
    const pages = Array.from({ length: 30 }, (_, index) =>
      page({ id: `p${index}`, url: `https://example.com/${index}`, importance: 100 - index }),
    );
    const result = packPageEvidence({
      pages,
      mode: "quick",
      // Leaves room for only a couple of pages.
      knowledgeTokens: SITE_TOKEN_BUDGET.quick - 900,
    });

    expect(result.packed.length).toBeGreaterThan(0);
    expect(result.deferred.length).toBeGreaterThan(0);
    expect(result.packed.length + result.deferred.length).toBe(30);
    expect(result.deferred[0]!.reason).toMatch(/budget/i);
    expect(result.tokensUsed).toBeLessThanOrEqual(result.tokensAvailable);
  });

  it("defers a page with no captured content rather than packing an empty block", () => {
    const result = packPageEvidence({
      pages: [
        page({ id: "empty", content: null, title: null, h1: null, metaDesc: null,
               pageType: null, headings: [], schema: [], url: "" }),
      ],
      mode: "quick",
      knowledgeTokens: 0,
    });
    expect(result.packed).toHaveLength(0);
    expect(result.deferred[0]!.reason).toMatch(/no content/i);
  });
});
