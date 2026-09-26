/**
 * The Pages screen's counts and the page detail's code view, from plain rows.
 * No database: these are the pure functions the screens render from.
 */

import type { Page, PageIssue, SitePage } from "@seo-maker/db";
import type { FeatureResult } from "@/lib/ai-results";
import { inspectPage } from "@/lib/page-inspector";
import { crawlCounts } from "@/lib/crawl-counts";
import { inScope, uncrawledPages, withTiers } from "@/lib/site-inventory";

const ROOT = "https://example.com";

function page(path: string, fields: Partial<Page> = {}): Page {
  return {
    id: `page${path}`,
    projectId: "p",
    crawlId: "c",
    url: `${ROOT}${path}`,
    finalUrl: null,
    status: "analyzed",
    statusCode: 200,
    crawlTier: "priority",
    evidence: null,
    createdAt: new Date("2026-09-01"),
    ...fields,
  } as Page;
}

function known(path: string, tier: "priority" | "standard"): SitePage {
  const url = path === "/" ? ROOT : `${ROOT}${path}`;
  return {
    id: `site${path}`,
    projectId: "p",
    url,
    pageKey: `example.com${path === "/" ? "" : path}`,
    path,
    homepage: path === "/",
    tier,
    tierSource: "auto",
    autoTier: tier,
    level: "high",
    pageType: null,
    reasons: null,
    sources: null,
    inSitemap: true,
    discoveredAt: new Date("2026-09-01"),
    lastCrawledAt: null,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  };
}

describe("page counts against the site's inventory", () => {
  // Ten known pages, all crawled: nine fetched successfully, one failed.
  const inventory = Array.from({ length: 10 }, (_, index) => known(index === 0 ? "/" : `/p${index}`, index < 3 ? "priority" : "standard"));
  const pages = inventory.map((row, index) =>
    page(row.path === "/" ? "" : row.path, index === 9 ? { status: "failed", statusCode: 500 } : {}),
  );

  it("reads 9 of 10 when one of ten crawled pages failed", () => {
    expect(crawlCounts(pages)).toEqual({ crawled: 9, total: 10, failed: 1 });
  });

  it("counts only pages crawled into the system, not pages discovered and never crawled", () => {
    const crawledOnly = pages.slice(0, 3);
    // Seven more pages are known from discovery; they are listed, not counted.
    expect(uncrawledPages(inventory, crawledOnly)).toHaveLength(7);
    expect(crawlCounts(crawledOnly)).toEqual({ crawled: 3, total: 3, failed: 0 });
  });

  it("does not count files a crawl met as pages: 100 pages and 4 files read 100 of 100", () => {
    const hundred = Array.from({ length: 100 }, (_, index) => page(`/p${index}`));
    const files = Array.from({ length: 4 }, (_, index) => page(`/file${index}.json`, { status: "excluded", errorType: "not-html" }));
    expect(crawlCounts([...hundred, ...files])).toEqual({ crawled: 100, total: 100, failed: 0 });
  });

  it("classifies crawled pages from the inventory, so a page made Priority since reads as Priority", () => {
    const promoted = inventory.map((row) => (row.path === "/p5" ? { ...row, tier: "priority" } : row));
    const tiered = withTiers([page("/p5", { crawlTier: "standard" })], promoted);
    expect(tiered[0]).toMatchObject({ tier: "priority", inventoryKey: "example.com/p5" });
  });

  it("splits pages by scope", () => {
    const tiered = withTiers(pages, inventory);
    expect(inScope(tiered, "priority")).toHaveLength(3);
    expect(inScope(tiered, "standard")).toHaveLength(7);
    expect(inScope(tiered, "general")).toHaveLength(10);
  });
});

describe("the page detail's code view", () => {
  const issue = (checkId: string, fields: Partial<PageIssue> = {}): PageIssue =>
    ({ id: checkId, pageId: "page", crawlId: "c", checkId, status: "fail", severity: "high", message: "", evidence: null, recommendation: null, createdAt: new Date(), ...fields }) as PageIssue;

  const target = {
    ...page("/pricing", { title: "Pricing", metaDesc: "Old description", h1: null, canonicalUrl: null }),
    issues: [issue("h1", { evidence: "No H1 on the page" }), issue("meta", { status: "warning", severity: "medium" })],
  };
  const result: FeatureResult = {
    id: "r",
    feature: "meta",
    status: "ok",
    mode: "quick",
    model: "m",
    provider: "p",
    knowledgeVersion: null,
    error: null,
    createdAt: new Date(),
    data: {
      current: "Old description",
      diagnosis: "Too vague.",
      suggestions: [
        { value: "One", reasoning: "a" },
        { value: "Two", reasoning: "b" },
        { value: "Three", reasoning: "c" },
      ],
      groundedIn: ["page"],
      confidence: "high",
      needsHumanReview: false,
    },
  };
  const checks = inspectPage({
    page: target,
    plan: [
      { checkId: "h1", status: "fail", severity: "high", strategy: "ai-generate", feature: "heading", reason: "From the text.", fix: null },
      { checkId: "meta", status: "warning", severity: "medium", strategy: "ai-generate", feature: "meta", reason: "From the text.", fix: null },
    ],
    recommendation: null,
    features: new Map([["meta", result]]),
    aiAllowed: true,
  });
  const byId = (id: string) => checks.find((check) => check.id === id)!;

  it("says so in a comment when the page has no code for a check", () => {
    expect(byId("h1").code).toMatchObject({ current: [], missing: "You don't have an H1 on this page." });
  });

  it("shows the page's own code for a check it has", () => {
    expect(byId("meta").code.current).toEqual(['<meta name="description" content="Old description" />']);
  });

  it("turns each AI suggestion into an option of real markup", () => {
    const meta = byId("meta").result!;
    expect(meta.ok).toBe(true);
    expect(meta.options.map((option) => option.lines[0])).toEqual([
      '<meta name="description" content="One" />',
      '<meta name="description" content="Two" />',
      '<meta name="description" content="Three" />',
    ]);
  });

  it("lists failing checks first and keeps passing ones for the Passed tab", () => {
    expect(checks.slice(0, 2).map((check) => check.id)).toEqual(["h1", "meta"]);
    expect(byId("title").status).toBe("pass");
    // A passing title can still be rewritten on request.
    expect(byId("title").optional).toBe(true);
  });
});
