import { describe, expect, it } from "vitest";
import { buildAiCrawlerMatrix, type CrawlerAccessInput } from "./crawler-access";
import { deriveAccessOpportunities, geoPriority } from "./opportunities";

function input(overrides: Partial<CrawlerAccessInput> = {}): CrawlerAccessInput {
  return {
    robotsTxt: "User-agent: *\nAllow: /\n",
    robotsStatus: 200,
    pages: [
      {
        id: "p1",
        url: "https://example.com/",
        statusCode: 200,
        robotsMeta: null,
        xRobotsTag: null,
        indexable: true,
        errorType: null,
        contentType: "text/html",
        wordCount: 500,
      },
    ],
    ...overrides,
  };
}

const context = { pageCount: 10, pageIds: ["p1"], pageUrls: ["https://example.com/"] };

describe("geoPriority", () => {
  // The point of storing the parts: the number on screen can be rebuilt from
  // them without re-running anything. The stored score is rounded while the
  // points are not, so they agree to within that rounding and no further.
  it("is reproducible from its stored parts", () => {
    const result = geoPriority({
      dimension: "aiCrawlerAccess",
      measured: 0.2,
      affected: 5,
      total: 10,
      effort: "low",
    });
    const summed = Object.values(result.parts).reduce((total, part) => total + part.points, 0);
    expect(Math.abs(summed - result.score)).toBeLessThanOrEqual(0.5);
  });

  it("ranks a wider gap above a narrower one", () => {
    const wide = geoPriority({ dimension: "aiCrawlerAccess", measured: 0, affected: 10, total: 10, effort: "low" });
    const narrow = geoPriority({ dimension: "aiCrawlerAccess", measured: 0.9, affected: 1, total: 10, effort: "low" });
    expect(wide.score).toBeGreaterThan(narrow.score);
  });

  it("prefers the cheaper fix when everything else matches", () => {
    const cheap = geoPriority({ dimension: "aiCrawlerAccess", measured: 0.5, affected: 5, total: 10, effort: "low" });
    const costly = geoPriority({ dimension: "aiCrawlerAccess", measured: 0.5, affected: 5, total: 10, effort: "high" });
    expect(cheap.score).toBeGreaterThan(costly.score);
  });

  // An unmeasured dimension has no known gap. Treating it as a total failure
  // would invent urgency out of our own ignorance.
  it("drops the gap term when the dimension was not measured", () => {
    const unmeasured = geoPriority({ dimension: "aiCrawlerAccess", measured: null, affected: 5, total: 10, effort: "low" });
    expect(unmeasured.parts.currentGap.weight).toBe(0);
    expect(unmeasured.score).toBeGreaterThan(0);
  });
});

describe("deriveAccessOpportunities", () => {
  it("returns nothing for a fully open site", () => {
    expect(deriveAccessOpportunities(buildAiCrawlerMatrix(input()), context)).toEqual([]);
  });

  // Not knowing is not a finding about the site.
  it("returns nothing when robots.txt could not be read", () => {
    const access = buildAiCrawlerMatrix(input({ robotsTxt: null, robotsStatus: 503 }));
    expect(access.signals["robots-root"]).toBe("unknown");
    expect(deriveAccessOpportunities(access, context)).toEqual([]);
  });

  it("reports a root block as critical and names the crawlers", () => {
    const access = buildAiCrawlerMatrix(
      input({ robotsTxt: "User-agent: OAI-SearchBot\nDisallow: /\n" }),
    );
    const drafts = deriveAccessOpportunities(access, context);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe("AI_CRAWLER_ACCESS");
    expect(drafts[0]!.severity).toBe("critical");
    expect(drafts[0]!.title).toContain("OAI-SearchBot");
    expect(drafts[0]!.evidence.length).toBeGreaterThan(0);
  });

  // Blocking a training crawler is a deliberate choice, so it must not become
  // a finding telling the owner to undo it.
  it("does not raise a finding for a blocked training crawler", () => {
    const access = buildAiCrawlerMatrix(input({ robotsTxt: "User-agent: GPTBot\nDisallow: /\n" }));
    expect(deriveAccessOpportunities(access, context)).toEqual([]);
  });

  it("reports one item per check rather than one per crawler", () => {
    const access = buildAiCrawlerMatrix(input({ robotsTxt: "User-agent: *\nDisallow: /\n" }));
    const drafts = deriveAccessOpportunities(access, context);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.evidence.some((item) => item.value.includes(","))).toBe(true);
  });

  it("raises a noindex finding scoped to Google's surfaces", () => {
    const access = buildAiCrawlerMatrix(
      input({ pages: [{ ...input().pages[0]!, indexable: false }] }),
    );
    const drafts = deriveAccessOpportunities(access, context);
    expect(drafts.map((draft) => draft.severity)).toContain("medium");
    expect(drafts[0]!.title.toLowerCase()).toContain("noindex");
  });

  it("orders by priority", () => {
    const access = buildAiCrawlerMatrix(
      input({
        robotsTxt: "User-agent: *\nDisallow: /\n",
        pages: [{ ...input().pages[0]!, statusCode: 500, indexable: false }],
      }),
    );
    const drafts = deriveAccessOpportunities(access, context);
    expect(drafts.length).toBeGreaterThan(1);
    for (let index = 1; index < drafts.length; index += 1) {
      expect(drafts[index - 1]!.priority).toBeGreaterThanOrEqual(drafts[index]!.priority);
    }
  });
});
