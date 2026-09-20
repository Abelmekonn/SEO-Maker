import { describe, expect, it } from "vitest";
import {
  type AuditablePage,
  type CheckId,
  checks,
  failedChecks,
  failsCheck,
  onPageCheckIds,
  pageCategoryScore,
  pageHealth,
  pageSeoScore,
  siteCategoryScore,
  siteSeoScore,
  technicalCheckIds,
} from "./page-audit";

/** A crawled page that passes all 13 checks. Override one field per test. */
function page(overrides: Partial<AuditablePage> = {}): AuditablePage {
  return {
    status: "analyzed",
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    statusCode: 200,
    title: "A title",
    metaDesc: "A meta description",
    h1: "A heading",
    h2Count: 1,
    canonicalUrl: "https://example.com/",
    imageCount: 2,
    missingAlt: 0,
    internalLinks: 1,
    wordCount: 300,
    schemaCount: 1,
    robotsOk: true,
    hasSitemap: true,
    indexable: true,
    ...overrides,
  };
}

describe("failsCheck thresholds", () => {
  const cases: Array<[CheckId, Partial<AuditablePage>, Partial<AuditablePage>]> = [
    ["status", { statusCode: 399 }, { statusCode: 400 }],
    ["status", { statusCode: 200 }, { statusCode: null }],
    ["title", { title: "x" }, { title: "   " }],
    ["meta", { metaDesc: "x" }, { metaDesc: "" }],
    ["h1", { h1: "x" }, { h1: null }],
    ["h2", { h2Count: 1 }, { h2Count: 0 }],
    ["canonical", { canonicalUrl: "https://x.com" }, { canonicalUrl: null }],
    ["images", { missingAlt: 0 }, { missingAlt: 1 }],
    ["links", { internalLinks: 1 }, { internalLinks: 0 }],
    ["words", { wordCount: 300 }, { wordCount: 299 }],
    ["schema", { schemaCount: 1 }, { schemaCount: 0 }],
    ["indexability", { indexable: true }, { indexable: false }],
    ["robots", { robotsOk: true }, { robotsOk: false }],
    ["sitemap", { hasSitemap: true }, { hasSitemap: false }],
  ];

  for (const [check, passing, failing] of cases) {
    it(`${check}: ${JSON.stringify(passing)} passes, ${JSON.stringify(failing)} fails`, () => {
      expect(failsCheck(page(passing), check)).toBe(false);
      expect(failsCheck(page(failing), check)).toBe(true);
    });
  }

  it("covers every declared check", () => {
    const covered = new Set(cases.map(([check]) => check));
    expect([...covered].sort()).toEqual(checks.map((check) => check.id).sort());
  });

  it("never fails a check on an uncrawled page", () => {
    const pending = page({ status: "pending", statusCode: null, title: null, h1: null });
    for (const check of checks) {
      expect(failsCheck(pending, check.id)).toBe(false);
    }
  });
});

describe("pageSeoScore", () => {
  it("is 100 when nothing fails", () => {
    expect(pageSeoScore(page())).toBe(100);
    expect(failedChecks(page())).toEqual([]);
  });

  it("follows round((13 - failed) / 13 * 100)", () => {
    const broken = page({ title: null, h1: null, schemaCount: 0 });
    const failed = failedChecks(broken).length;
    expect(failed).toBe(3);
    expect(pageSeoScore(broken)).toBe(Math.round(((checks.length - failed) / checks.length) * 100));
  });

  it("is null for an uncrawled page", () => {
    expect(pageSeoScore(page({ status: "pending" }))).toBeNull();
  });
});

describe("site aggregates", () => {
  it("averages page scores", () => {
    const scores = siteSeoScore([page(), page({ title: null })]);
    expect(scores).toBe(Math.round((100 + pageSeoScore(page({ title: null }))!) / 2));
  });

  it("is null when no page has been crawled", () => {
    expect(siteSeoScore([page({ status: "pending" })])).toBeNull();
    expect(siteCategoryScore([], technicalCheckIds)).toBeNull();
  });

  it("scores categories independently", () => {
    const noSchema = page({ schemaCount: 0 });
    expect(pageCategoryScore(noSchema, technicalCheckIds)).toBe(
      Math.round(((technicalCheckIds.length - 1) / technicalCheckIds.length) * 100),
    );
    expect(pageCategoryScore(noSchema, onPageCheckIds)).toBe(100);
  });
});

describe("pageHealth", () => {
  it("classifies a clean page as optimized", () => {
    expect(pageHealth(page())).toBe("optimized");
  });

  it("treats a bad status code as critical", () => {
    expect(pageHealth(page({ statusCode: 500 }))).toBe("critical");
  });

  it("treats noindex as critical", () => {
    expect(pageHealth(page({ indexable: false }))).toBe("critical");
  });

  it("treats thin content alone as a warning", () => {
    expect(pageHealth(page({ wordCount: 100 }))).toBe("warnings");
  });

  it("treats a missing title as an issue", () => {
    expect(pageHealth(page({ title: null }))).toBe("issues");
  });

  it("is pending before the crawl runs", () => {
    expect(pageHealth(page({ status: "pending" }))).toBe("pending");
  });
});
