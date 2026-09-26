import { describe, expect, it } from "vitest";
import { diffIssues, opportunityOutcome, recommendationOutcomes } from "./outcomes";

const issue = (pageKey: string, checkId: string) => ({ pageKey, checkId, severity: "high" });

describe("diffIssues", () => {
  const diff = diffIssues({
    beforePages: ["x.com", "x.com/a", "x.com/gone"],
    afterPages: ["x.com", "x.com/a", "x.com/new"],
    before: [issue("x.com", "meta"), issue("x.com/a", "title"), issue("x.com/gone", "meta")],
    after: [issue("x.com/a", "title"), issue("x.com/a", "h1"), issue("x.com/new", "meta")],
  });

  it("classifies issues on pages both crawls fetched", () => {
    expect(diff.fixed).toEqual([issue("x.com", "meta")]);
    expect(diff.persisting).toEqual([issue("x.com/a", "title")]);
    expect(diff.introduced).toEqual([issue("x.com/a", "h1")]);
  });

  it("never counts a page the second crawl did not fetch as fixed", () => {
    expect(diff.fixed.map((row) => row.pageKey)).not.toContain("x.com/gone");
    expect(diff.pagesOnlyBefore).toBe(1);
    expect(diff.pagesOnlyAfter).toBe(1);
    expect(diff.comparablePages).toBe(2);
  });

  it("summarises by check", () => {
    expect(diff.byCheck.find((row) => row.checkId === "meta")).toEqual({ checkId: "meta", fixed: 1, introduced: 0, persisting: 0 });
  });
});

describe("recommendationOutcomes", () => {
  const latest = {
    startedAt: new Date("2026-09-10"),
    pages: ["x.com", "x.com/a"],
    failing: [issue("x.com/a", "title")],
  };
  const at = new Date("2026-09-05");

  it("reads each recommendation against the latest crawl", () => {
    const outcomes = recommendationOutcomes(
      [
        { pageKey: "x.com", checkId: "meta", recommendedAt: at },
        { pageKey: "x.com/a", checkId: "title", recommendedAt: at },
        { pageKey: "x.com/b", checkId: "meta", recommendedAt: at },
        { pageKey: "x.com", checkId: "h1", recommendedAt: new Date("2026-09-11") },
      ],
      latest,
    );
    expect(outcomes.map((row) => row.outcome)).toEqual(["resolved", "persists", "not-rechecked", "awaiting-recrawl"]);
  });
});

describe("opportunityOutcome", () => {
  const base = { baselineCount: 10, affectedCount: 10, resolvedAt: null, firstSeenInLatestCrawl: false };

  it("tracks the condition's movement since it was first found", () => {
    expect(opportunityOutcome(base)).toBe("unchanged");
    expect(opportunityOutcome({ ...base, affectedCount: 4 })).toBe("improved");
    expect(opportunityOutcome({ ...base, affectedCount: 12 })).toBe("worse");
    expect(opportunityOutcome({ ...base, resolvedAt: new Date() })).toBe("resolved");
    expect(opportunityOutcome({ ...base, firstSeenInLatestCrawl: true })).toBe("new");
  });
});
