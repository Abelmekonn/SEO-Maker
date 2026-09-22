import { describe, expect, it } from "vitest";
import { type ComparableCrawl, compareCrawls, isImprovement } from "./compare";

function crawl(overrides: Partial<ComparableCrawl> = {}): ComparableCrawl {
  return {
    id: "c1",
    startedAt: new Date("2026-09-01T00:00:00Z"),
    finishedAt: new Date("2026-09-01T00:05:00Z"),
    status: "completed",
    crawled: 100,
    analyzed: 98,
    failed: 2,
    issueCount: 40,
    seoScore: 80,
    technicalScore: 76,
    onPageScore: 84,
    ...overrides,
  };
}

describe("compareCrawls", () => {
  it("returns null on a first crawl rather than comparing against nothing", () => {
    expect(compareCrawls([crawl()])).toBeNull();
    expect(compareCrawls([])).toBeNull();
  });

  it("compares the two most recent finished crawls", () => {
    const comparison = compareCrawls([
      crawl({ id: "old", startedAt: new Date("2026-09-01T00:00:00Z"), seoScore: 74, issueCount: 54 }),
      crawl({ id: "new", startedAt: new Date("2026-09-08T00:00:00Z"), seoScore: 82, issueCount: 40 }),
    ]);

    expect(comparison?.current.id).toBe("new");
    expect(comparison?.previous.id).toBe("old");
    expect(comparison?.deltas.find((d) => d.label === "SEO readiness")?.change).toBe(8);
    expect(comparison?.deltas.find((d) => d.label === "Issues")?.change).toBe(-14);
  });

  it("ignores crawls that never finished", () => {
    const comparison = compareCrawls([
      crawl({ id: "running", startedAt: new Date("2026-09-09T00:00:00Z"), status: "crawling" }),
      crawl({ id: "new", startedAt: new Date("2026-09-08T00:00:00Z") }),
      crawl({ id: "old", startedAt: new Date("2026-09-01T00:00:00Z") }),
    ]);
    expect(comparison?.current.id).toBe("new");
  });

  it("reports an unchanged run instead of inventing movement", () => {
    const comparison = compareCrawls([
      crawl({ id: "a", startedAt: new Date("2026-09-01T00:00:00Z") }),
      crawl({ id: "b", startedAt: new Date("2026-09-08T00:00:00Z") }),
    ]);
    expect(comparison?.unchanged).toBe(true);
  });

  it("leaves a delta null when a score could not be measured", () => {
    const comparison = compareCrawls([
      crawl({ id: "a", startedAt: new Date("2026-09-01T00:00:00Z"), seoScore: null }),
      crawl({ id: "b", startedAt: new Date("2026-09-08T00:00:00Z"), seoScore: 90 }),
    ]);
    expect(comparison?.deltas.find((d) => d.label === "SEO readiness")?.change).toBeNull();
  });
});

describe("isImprovement", () => {
  it("reads direction per metric", () => {
    expect(
      isImprovement({ label: "s", change: 5, higherIsBetter: true, current: 5, previous: 0 }),
    ).toBe(true);
    expect(
      isImprovement({ label: "i", change: 5, higherIsBetter: false, current: 5, previous: 0 }),
    ).toBe(false);
    expect(
      isImprovement({ label: "i", change: -5, higherIsBetter: false, current: 0, previous: 5 }),
    ).toBe(true);
  });

  it("is null when nothing moved", () => {
    expect(
      isImprovement({ label: "s", change: 0, higherIsBetter: true, current: 1, previous: 1 }),
    ).toBeNull();
  });
});
