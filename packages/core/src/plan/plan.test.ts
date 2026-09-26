import { describe, expect, it } from "vitest";
import { crawlsPerSite, planAllowsAi, planIdOf, planLimits } from "./index";

describe("plan limits", () => {
  it("gives Free one page: the homepage, crawled as Priority", () => {
    expect(planLimits.free.maxPages).toBe(1);
    expect(planLimits.free.priorityPages).toBe(1);
    expect(planLimits.free.maxProjects).toBe(1);
  });

  it("gives Free Deep Analysis, performance and homepage Page AI", () => {
    expect(planLimits.free.deepMode).toBe(true);
    expect(planLimits.free.performance).toBe(true);
    expect(planAllowsAi(planLimits.free, "page")).toBe(true);
    expect(planLimits.free.aiHomepageOnly).toBe(true);
  });

  it("caps Free AI at 2 generations a day and 10 a week", () => {
    expect(planLimits.free.aiDailyLimit).toBe(2);
    expect(planLimits.free.aiWeeklyLimit).toBe(10);
  });

  it("withholds competitor and site AI, and competitors, from Free", () => {
    expect(planAllowsAi(planLimits.free, "competitor")).toBe(false);
    expect(planAllowsAi(planLimits.free, "site")).toBe(false);
    expect(planLimits.free.maxCompetitors).toBe(0);
  });

  it("allows Free one re-crawl after the first crawl", () => {
    expect(planLimits.free.recrawlsPerSite).toBe(1);
    expect(crawlsPerSite(planLimits.free)).toBe(2);
  });

  it("leaves paid plans without a per-user AI or re-crawl cap", () => {
    for (const limits of [planLimits.pro, planLimits.agency]) {
      expect(limits.aiDailyLimit).toBeNull();
      expect(limits.aiWeeklyLimit).toBeNull();
      expect(crawlsPerSite(limits)).toBeNull();
      expect(planAllowsAi(limits, "page")).toBe(true);
      expect(planAllowsAi(limits, "site")).toBe(true);
      expect(planAllowsAi(limits, "competitor")).toBe(true);
      expect(limits.aiHomepageOnly).toBe(false);
    }
  });

  it("never caps Priority above the crawl budget", () => {
    for (const limits of Object.values(planLimits)) {
      expect(limits.priorityPages).toBeLessThanOrEqual(limits.maxPages);
    }
  });

  it("keeps Priority well below the crawl budget on the largest plan", () => {
    // Priority pages store full text and ground AI; a 100-page crawl does not
    // mean 100 pages matter that much.
    expect(planLimits.agency.priorityPages).toBeLessThan(planLimits.agency.maxPages);
  });

  it("reads anything unrecognised as Free", () => {
    expect(planIdOf("agency")).toBe("agency");
    expect(planIdOf("enterprise")).toBe("free");
    expect(planIdOf(null)).toBe("free");
  });
});
