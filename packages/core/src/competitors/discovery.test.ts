import { describe, expect, it } from "vitest";
import { decideDiscoveryAction, discoveryMessage, readDiscoveryResult } from "./discovery";
import { competitorPolicy, isFresh } from "./policy";

const now = new Date("2026-09-26T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("decideDiscoveryAction", () => {
  const base = { trackedCount: 1, maxCompetitors: 5, crawlTtlHours: 168, now };

  it("creates a competitor the project does not track", () => {
    expect(decideDiscoveryAction({ ...base, existing: null })).toBe("create");
  });

  it("reuses a competitor crawled within the freshness window: no second crawl", () => {
    const existing = { status: "ready", excluded: false, pageCount: 6, lastCrawledAt: hoursAgo(24) };
    expect(decideDiscoveryAction({ ...base, existing })).toBe("reuse");
  });

  it("re-crawls only when the stored crawl is stale or never succeeded", () => {
    expect(decideDiscoveryAction({ ...base, existing: { status: "ready", excluded: false, pageCount: 6, lastCrawledAt: hoursAgo(200) } })).toBe("refresh");
    expect(decideDiscoveryAction({ ...base, existing: { status: "failed", excluded: false, pageCount: 0, lastCrawledAt: null } })).toBe("refresh");
  });

  it("leaves a competitor that is being analyzed alone", () => {
    expect(decideDiscoveryAction({ ...base, existing: { status: "crawling", excluded: false, pageCount: 0, lastCrawledAt: null } })).toBe("in-progress");
  });

  it("respects the plan's competitor limit for a new competitor", () => {
    expect(decideDiscoveryAction({ ...base, trackedCount: 5, existing: null })).toBe("limit-reached");
  });
});

describe("policy", () => {
  it("has defaults and bounded overrides", () => {
    expect(competitorPolicy({})).toMatchObject({ crawlTtlHours: 168, serpTtlHours: 72, pageLimit: 8 });
    expect(competitorPolicy({ COMPETITOR_PAGE_LIMIT: "100", COMPETITOR_CRAWL_TTL_HOURS: "24" })).toMatchObject({ pageLimit: 15, crawlTtlHours: 24 });
    expect(competitorPolicy({ COMPETITOR_PAGE_LIMIT: "nonsense" }).pageLimit).toBe(8);
  });

  it("isFresh compares against the window", () => {
    expect(isFresh(hoursAgo(10), 72, now)).toBe(true);
    expect(isFresh(hoursAgo(80), 72, now)).toBe(false);
    expect(isFresh(null, 72, now)).toBe(false);
  });
});

describe("discoveryMessage", () => {
  it("says an existing competitor was reused rather than found again", () => {
    expect(discoveryMessage({ outcome: "existing", domain: "adyen.com", appearances: 7, queriesChecked: 8 })).toBe(
      "No new competitor found. adyen.com is still the strongest observed competitor for your current search queries. Existing analysis was reused.",
    );
  });

  it("never claims a ranking, only observed searches", () => {
    expect(discoveryMessage({ outcome: "new", domain: "adyen.com", appearances: 7, queriesChecked: 8 })).toBe(
      "adyen.com is the strongest observed search competitor, found across 7 of 8 relevant searches.",
    );
  });
});

describe("readDiscoveryResult", () => {
  it("rejects anything that is not a stored result", () => {
    expect(readDiscoveryResult(null)).toBeNull();
    expect(readDiscoveryResult({ outcome: 1 })).toBeNull();
    expect(readDiscoveryResult({ outcome: "none", message: "x" })).not.toBeNull();
  });
});
