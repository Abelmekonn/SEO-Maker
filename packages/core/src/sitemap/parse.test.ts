import { describe, expect, it } from "vitest";
import { buildSitemapAudit } from "./audit";
import { parseSitemapXml } from "./parse";

describe("parseSitemapXml", () => {
  it("reads a urlset", () => {
    const parsed = parseSitemapXml(
      `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://x.com/a</loc><lastmod>2026-01-01</lastmod></url>
        <url><loc>https://x.com/b</loc></url>
      </urlset>`,
    );
    expect(parsed.kind).toBe("urlset");
    expect(parsed.entries.map((e) => e.loc)).toEqual(["https://x.com/a", "https://x.com/b"]);
    expect(parsed.entries[0].lastmod).toBe("2026-01-01");
  });

  it("reads a sitemap index", () => {
    const parsed = parseSitemapXml(
      `<sitemapindex><sitemap><loc>https://x.com/s1.xml</loc></sitemap>
       <sitemap><loc>https://x.com/s2.xml</loc></sitemap></sitemapindex>`,
    );
    expect(parsed.kind).toBe("index");
    expect(parsed.entries).toHaveLength(2);
  });

  it("decodes entities and CDATA", () => {
    const parsed = parseSitemapXml(
      "<urlset><url><loc>https://x.com/a?b=1&amp;c=2</loc></url>" +
        "<url><loc><![CDATA[https://x.com/d]]></loc></url></urlset>",
    );
    expect(parsed.entries[0].loc).toBe("https://x.com/a?b=1&c=2");
    expect(parsed.entries[1].loc).toBe("https://x.com/d");
  });

  it("keeps the readable URLs and records the broken ones", () => {
    const parsed = parseSitemapXml(
      "<urlset><url><loc>https://x.com/a</loc></url><url><loc>not-a-url</loc></url></urlset>",
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.malformed).toEqual(["not-a-url"]);
  });

  it("falls back to bare loc elements", () => {
    const parsed = parseSitemapXml("<loc>https://x.com/a</loc><loc>https://x.com/b</loc>");
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.wellFormed).toBe(false);
  });
});

describe("buildSitemapAudit", () => {
  const doc = {
    url: "https://x.com/sitemap.xml",
    kind: "urlset" as const,
    status: 200,
    ok: true,
    entryCount: 4,
    malformedCount: 0,
    error: null,
  };

  it("reports broken, redirecting and noindex sitemap URLs from crawl evidence", () => {
    const audit = buildSitemapAudit({
      documents: [doc],
      urlCount: 4,
      offSiteCount: 0,
      duplicateCount: 1,
      disallowedCount: 0,
      evidence: [
        { url: "https://x.com/ok", statusCode: 200, finalUrl: "https://x.com/ok", indexable: true },
        { url: "https://x.com/gone", statusCode: 404, finalUrl: null, indexable: null },
        {
          url: "https://x.com/old",
          statusCode: 200,
          finalUrl: "https://x.com/new",
          indexable: true,
        },
        {
          url: "https://x.com/hidden",
          statusCode: 200,
          finalUrl: "https://x.com/hidden",
          indexable: false,
        },
      ],
    });

    expect(audit.found).toBe(true);
    expect(audit.valid).toBe(true);
    expect(audit.brokenUrls).toEqual(["https://x.com/gone"]);
    expect(audit.redirectingUrls).toEqual([{ url: "https://x.com/old", to: "https://x.com/new" }]);
    expect(audit.noindexUrls).toEqual(["https://x.com/hidden"]);
    expect(audit.issueCount).toBe(3);
  });

  it("is invalid when a document did not parse", () => {
    const audit = buildSitemapAudit({
      documents: [{ ...doc, kind: "unknown", malformedCount: 2 }],
      urlCount: 0,
      offSiteCount: 0,
      duplicateCount: 0,
      disallowedCount: 0,
      evidence: [],
    });
    expect(audit.valid).toBe(false);
  });

  it("is not found when nothing was reachable", () => {
    const audit = buildSitemapAudit({
      documents: [{ ...doc, ok: false, status: 404 }],
      urlCount: 0,
      offSiteCount: 0,
      duplicateCount: 0,
      disallowedCount: 0,
      evidence: [],
    });
    expect(audit.found).toBe(false);
  });
});
