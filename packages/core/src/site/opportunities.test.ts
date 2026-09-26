import { describe, expect, it } from "vitest";
import { type BuildSiteIntelligenceInput, buildSiteIntelligence } from "./intelligence";
import { deriveSiteOpportunities } from "./opportunities";
import { link, sitePage } from "./test-fixtures";

const issue = (checkId: string, severity = "high", status = "fail") => ({ checkId, severity, status });

function site(extra: Partial<BuildSiteIntelligenceInput> = {}) {
  return buildSiteIntelligence({
    rootUrl: "https://x.com",
    pages: [
      sitePage({ url: "https://x.com/", depth: 0, title: "X", links: [link("https://x.com/services/audit"), link("https://x.com/services/tax")] }),
      sitePage({ url: "https://x.com/services/audit", pageType: "service", title: "Audit", issues: [issue("meta")] }),
      sitePage({ url: "https://x.com/services/tax", pageType: "service", title: "Tax", issues: [issue("meta")] }),
      sitePage({ url: "https://x.com/services/payroll", pageType: "service", title: "Payroll", issues: [issue("meta"), issue("h2", "low", "warning")] }),
      sitePage({ url: "https://x.com/blocked", title: "Blocked", issues: [issue("indexability", "critical")] }),
    ],
    ...extra,
  });
}

describe("deriveSiteOpportunities", () => {
  it("turns each failing check into one site-level opportunity with its evidence", () => {
    const meta = deriveSiteOpportunities(site()).find((row) => row.key === "check:meta");
    expect(meta).toBeDefined();
    expect(meta!.title).toBe("Write meta descriptions for 3 pages (all service pages)");
    expect(meta!.affectedCount).toBe(3);
    expect(meta!.facts[0]).toContain("on 3 pages of 5 crawled pages");
    expect(meta!.category).toBe("onpage");
  });

  it("never states a character count or a word-count target", () => {
    for (const row of deriveSiteOpportunities(site())) {
      const text = [row.title, row.rationale, row.action, ...row.facts].join(" ");
      expect(text).not.toMatch(/\d+\s*(to|-)\s*\d+\s*characters|\bcharacters?\b.*\blimit|\d{3,}\+?\s*words\b/i);
    }
  });

  it("ranks an indexing blocker above a snippet problem, reproducibly", () => {
    const first = deriveSiteOpportunities(site());
    const keys = first.map((row) => row.key);
    expect(keys.indexOf("check:indexability")).toBeLessThan(keys.indexOf("check:meta"));
    expect(deriveSiteOpportunities(site()).map((row) => row.key)).toEqual(keys);
  });

  it("finds orphans and weights confidence by how much of the site was crawled", () => {
    const partial = deriveSiteOpportunities(
      site({ crawl: { discovered: 50, analyzed: 5, maxPages: 5, robotsAudit: null, sitemapAudit: null } }),
    ).find((row) => row.key === "links:orphans");
    const full = deriveSiteOpportunities(
      site({ crawl: { discovered: 5, analyzed: 5, maxPages: 5, robotsAudit: null, sitemapAudit: null } }),
    ).find((row) => row.key === "links:orphans");
    expect(full!.affected.map((row) => row.path)).toEqual(expect.arrayContaining(["/services/payroll", "/blocked"]));
    expect(partial!.confidence).toBeLessThan(full!.confidence);
    expect(partial!.facts.join(" ")).toContain("links from pages it did not reach are not counted");
  });

  it("looks for pages about the listed offerings only in Deep mode", () => {
    const quick = deriveSiteOpportunities(site());
    expect(quick.find((row) => row.key === "content:offerings")).toBeUndefined();

    const deep = deriveSiteOpportunities(site({ business: { offerings: ["Audit", "Bookkeeping"], targetKeywords: [] } }));
    const offerings = deep.find((row) => row.key === "content:offerings");
    expect(offerings?.facts.join(" ")).toContain('"Bookkeeping"');
    expect(offerings?.facts.join(" ")).not.toContain('"Audit"');
  });

  it("reports target keywords no page focuses on", () => {
    const deep = deriveSiteOpportunities(
      site({ business: { offerings: [], targetKeywords: ["tax returns", "payroll"] } }),
    );
    const keywords = deep.find((row) => row.key === "content:keywords");
    expect(keywords?.facts[0]).toContain('"tax returns"');
    expect(keywords?.facts[0]).not.toContain('"payroll"');
  });

  it("builds performance opportunities from summarized PageSpeed runs", () => {
    const run = (pageKey: string, lcp: number) => ({
      pageKey,
      strategy: "mobile",
      performance: 40,
      lcp,
      cls: 0.02,
      tbt: 100,
      inp: null,
      opportunities: [{ id: "render-blocking-resources", title: "Eliminate render-blocking resources", savingsMs: 900 }],
      createdAt: new Date("2026-09-01"),
    });
    const rows = deriveSiteOpportunities(site({ performance: [run("x.com", 5.1), run("x.com/services/audit", 3)] }));
    const lcp = rows.find((row) => row.key === "perf:lcp:mobile");
    expect(lcp?.affectedCount).toBe(2);
    expect(lcp?.facts[0]).toContain("poor (over 4 s) on 1 page of 2 measured");
    expect(rows.find((row) => row.key === "perf:audit:render-blocking-resources")?.facts[0]).toContain("1.8 s");
    expect(rows.find((row) => row.key === "perf:cls:mobile")).toBeUndefined();
  });

  it("treats a robots.txt that blocks everything as critical", () => {
    const rows = deriveSiteOpportunities(
      site({
        crawl: {
          discovered: 5,
          analyzed: 5,
          maxPages: 5,
          robotsAudit: { found: true, url: "https://x.com/robots.txt", blocksEverything: true, appliedAgent: "*", warnings: [], blockedSitemapUrls: [] },
          sitemapAudit: null,
        },
      }),
    );
    expect(rows[0].key).toBe("robots:blocks-all");
    expect(rows[0].priority.band).toBe("critical");
  });
});
