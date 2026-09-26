import { describe, expect, it } from "vitest";
import type { RobotsAudit } from "../robots/audit";
import type { SitemapAudit } from "../sitemap/audit";
import { type SitemapSourcePage, foundSitemapUrl, generateSitemap, recommendRobots, recommendSitemap } from "./files";

function page(overrides: Partial<SitemapSourcePage> = {}): SitemapSourcePage {
  return {
    url: "https://x.com/a",
    finalUrl: null,
    status: "analyzed",
    statusCode: 200,
    indexable: true,
    canonicalUrl: null,
    robotsDisallowed: false,
    ...overrides,
  };
}

function sitemapAudit(overrides: Partial<SitemapAudit> = {}): SitemapAudit {
  return {
    documents: [{ url: "https://x.com/sitemap.xml", kind: "urlset", status: 200, ok: true, entryCount: 3, malformedCount: 0, error: null }],
    found: true,
    valid: true,
    urlCount: 3,
    offSiteCount: 0,
    duplicateCount: 0,
    disallowedCount: 0,
    sampledCount: 3,
    brokenUrls: [],
    redirectingUrls: [],
    noindexUrls: [],
    issueCount: 0,
    ...overrides,
  };
}

function robotsAudit(overrides: Partial<RobotsAudit> = {}): RobotsAudit {
  return {
    url: "https://x.com/robots.txt",
    found: true,
    status: 200,
    valid: true,
    sitemaps: [],
    hasSitemapDirective: false,
    groupCount: 1,
    appliedAgent: "*",
    disallowCount: 0,
    allowCount: 0,
    crawlDelay: null,
    warnings: [],
    blockedSitemapUrls: [],
    blocksEverything: false,
    ...overrides,
  };
}

describe("generateSitemap", () => {
  const pages = [
    page({ url: "https://x.com/b" }),
    page({ url: "https://x.com/" }),
    page({ url: "https://x.com/noindex", indexable: false }),
    page({ url: "https://x.com/copy", canonicalUrl: "https://x.com/b" }),
    page({ url: "https://x.com/error", statusCode: 500 }),
    page({ url: "https://x.com/moved", finalUrl: "https://x.com/b" }),
    page({ url: "https://other.com/c" }),
    page({ url: "https://x.com/q?a=1&b=2" }),
  ];
  const result = generateSitemap(pages, "https://x.com");

  it("lists only crawled, indexable, self-canonical pages on the site, homepage first", () => {
    expect(result.urls).toEqual(["https://x.com/", "https://x.com/b", "https://x.com/q?a=1&b=2"]);
  });

  it("says why each other page was left out", () => {
    const reasons = Object.fromEntries(result.excluded.map((row) => [row.url, row.reason]));
    expect(reasons["https://x.com/noindex"]).toBe("Sends noindex");
    expect(reasons["https://x.com/copy"]).toContain("Canonical points to");
    expect(reasons["https://x.com/error"]).toBe("Answered HTTP 500");
    expect(reasons["https://other.com/c"]).toBe("On another host");
  });

  it("escapes XML and reads back cleanly with the crawler's own parser", () => {
    expect(result.xml).toContain("https://x.com/q?a=1&amp;b=2");
    expect(result.validation).toEqual({ ok: true, errors: [] });
  });

  it("fails validation when nothing is eligible, rather than offering an empty file", () => {
    expect(generateSitemap([page({ indexable: false })], "https://x.com").validation.ok).toBe(false);
  });
});

describe("recommendSitemap", () => {
  it("names entries to remove and crawled pages to add, from evidence", () => {
    const result = recommendSitemap({
      rootUrl: "https://x.com",
      pages: [page({ url: "https://x.com/a", inSitemap: true }), page({ url: "https://x.com/new", inSitemap: false })],
      audit: sitemapAudit({ brokenUrls: ["https://x.com/dead"], redirectingUrls: [{ url: "https://x.com/old", to: "https://x.com/a" }] }),
      discovered: 40,
    });
    expect(result.status).toBe("needs-changes");
    expect(result.add).toEqual(["https://x.com/new"]);
    expect(result.remove).toEqual([
      { url: "https://x.com/dead", reason: "Answers with an error" },
      { url: "https://x.com/old", reason: "Redirects", replaceWith: "https://x.com/a" },
    ]);
    expect(result.coverageNote).toContain("at least 40 known URLs");
  });

  it("reports a missing sitemap", () => {
    expect(recommendSitemap({ rootUrl: "https://x.com", pages: [page()], audit: null }).status).toBe("missing");
  });
});

describe("recommendRobots", () => {
  it("writes a complete, valid file only when the site has none", () => {
    const result = recommendRobots({ audit: robotsAudit({ found: false, status: 404 }), sitemapUrl: "https://x.com/sitemap.xml" });
    expect(result.status).toBe("missing");
    expect(result.file).toBe("User-agent: *\nAllow: /\n\nSitemap: https://x.com/sitemap.xml\n");
    expect(result.validation.ok).toBe(true);
  });

  it("suggests lines to add instead of replacing a file it never read", () => {
    const result = recommendRobots({ audit: robotsAudit(), sitemapUrl: "https://x.com/sitemap.xml" });
    expect(result.file).toBeNull();
    expect(result.additions).toEqual(["Sitemap: https://x.com/sitemap.xml"]);
    expect(result.validation.ok).toBe(true);
  });

  it("flags a file that blocks the whole site as critical", () => {
    const result = recommendRobots({ audit: robotsAudit({ blocksEverything: true, hasSitemapDirective: true }), sitemapUrl: null });
    expect(result.findings[0].severity).toBe("critical");
  });

  it("is fine with a file that already does its job", () => {
    const result = recommendRobots({ audit: robotsAudit({ hasSitemapDirective: true }), sitemapUrl: "https://x.com/sitemap.xml" });
    expect(result.status).toBe("ok");
    expect(result.additions).toEqual([]);
  });
});

describe("foundSitemapUrl", () => {
  it("prefers a sitemap index over its children", () => {
    const audit = sitemapAudit({
      documents: [
        { url: "https://x.com/child.xml", kind: "urlset", status: 200, ok: true, entryCount: 1, malformedCount: 0, error: null },
        { url: "https://x.com/index.xml", kind: "index", status: 200, ok: true, entryCount: 1, malformedCount: 0, error: null },
      ],
    });
    expect(foundSitemapUrl(audit)).toBe("https://x.com/index.xml");
    expect(foundSitemapUrl(null)).toBeNull();
  });
});
