import { describe, expect, it } from "vitest";
import { buildSiteIntelligence, isGenericAnchor, pageImportance } from "./intelligence";
import { link, sitePage } from "./test-fixtures";

describe("buildSiteIntelligence link graph", () => {
  const intel = buildSiteIntelligence({
    rootUrl: "https://x.com",
    pages: [
      sitePage({
        url: "https://x.com/",
        depth: 0,
        title: "X",
        links: [link("https://x.com/pricing", "Pricing"), link("https://x.com/old-docs", "Docs"), link("https://x.com/pricing", "Plans")],
      }),
      sitePage({ url: "https://x.com/pricing", pageType: "pricing", links: [link("https://x.com/", "Home"), link("https://x.com/gone", "read more")] }),
      // Reached through a redirect: links to /old-docs must land here.
      sitePage({ url: "https://x.com/old-docs", finalUrl: "https://x.com/docs", pageType: "documentation" }),
      sitePage({ url: "https://x.com/lonely", depth: 3 }),
      sitePage({ url: "https://x.com/gone", status: "failed", statusCode: 404 }),
    ],
  });

  it("maps links through redirects and counts distinct inlinks", () => {
    const docs = intel.pages.find((page) => page.key === "x.com/docs");
    const pricing = intel.pages.find((page) => page.key === "x.com/pricing");
    expect(docs?.inlinks).toBe(1);
    // Two links from the homepage to pricing are one edge.
    expect(pricing?.inlinks).toBe(1);
  });

  it("finds orphans but never calls the homepage one", () => {
    expect(intel.links.orphans).toEqual(["x.com/lonely"]);
  });

  it("records links pointing at pages that errored", () => {
    expect(intel.links.broken).toEqual([{ from: "x.com/pricing", to: "x.com/gone", anchor: "read more" }]);
  });

  it("flags generic anchors", () => {
    expect(intel.links.genericAnchors.map((edge) => edge.anchor)).toEqual(["read more"]);
    expect(isGenericAnchor("Read more »")).toBe(true);
    expect(isGenericAnchor("Pricing for teams")).toBe(false);
  });

  it("keeps failed pages out of the inventory but in the issue picture", () => {
    expect(intel.pages.map((page) => page.key)).not.toContain("x.com/gone");
    expect(intel.failedPages.map((page) => page.key)).toEqual(["x.com/gone"]);
  });
});

describe("buildSiteIntelligence content", () => {
  it("treats words on most pages as boilerplate rather than topic", () => {
    const pages = ["payments", "billing", "invoicing", "terminal"].map((slug) =>
      sitePage({ url: `https://x.com/${slug}`, title: `${slug} | Acme`, h1: `${slug} for business` }),
    );
    const intel = buildSiteIntelligence({ rootUrl: "https://x.com", pages });
    const billing = intel.pages.find((page) => page.key === "x.com/billing");
    expect(billing?.topicTerms).toContain("billing");
    expect(billing?.topicTerms).not.toContain("acme");
    expect(billing?.topicTerms).not.toContain("business");
  });

  it("groups exact duplicate titles, ignoring case and spacing", () => {
    const intel = buildSiteIntelligence({
      rootUrl: "https://x.com",
      pages: [
        sitePage({ url: "https://x.com/a", title: "Pricing  Plans" }),
        sitePage({ url: "https://x.com/b", title: "pricing plans" }),
        sitePage({ url: "https://x.com/c", title: "Something else" }),
      ],
    });
    expect(intel.duplicates.titles).toEqual([{ value: "Pricing  Plans", pages: ["x.com/a", "x.com/b"] }]);
  });

  it("finds related pages that do not link to each other", () => {
    const intel = buildSiteIntelligence({
      rootUrl: "https://x.com",
      pages: [
        sitePage({ url: "https://x.com/guides/invoice-templates", h1: "Invoice templates for freelancers", h2: ["Free invoice templates"] }),
        sitePage({ url: "https://x.com/guides/freelancer-invoices", h1: "How freelancers send invoices", h2: ["Invoice templates"] }),
        sitePage({ url: "https://x.com/careers", h1: "Careers at X" }),
      ],
    });
    expect(intel.links.relatedUnlinked[0]).toMatchObject({ a: "x.com/guides/invoice-templates", b: "x.com/guides/freelancer-invoices" });
    expect(intel.links.relatedUnlinked[0].shared).toEqual(expect.arrayContaining(["invoice", "freelancer"]));
  });

  it("never carries page bodies, even when handed a full page row", () => {
    // A Prisma Page row carries `content`; the builder must not pass it on.
    const row = { ...sitePage({ url: "https://x.com/a", title: "A" }), content: "UNIQUE BODY TEXT OF THE PAGE" };
    const intel = buildSiteIntelligence({ rootUrl: "https://x.com", pages: [row] });
    expect(JSON.stringify(intel)).not.toContain("UNIQUE BODY TEXT");
  });

  it("reports pages the site's own sitemap leaves out, only when a sitemap exists", () => {
    const pages = [sitePage({ url: "https://x.com/a", inSitemap: false }), sitePage({ url: "https://x.com/b", inSitemap: true })];
    const withSitemap = buildSiteIntelligence({
      rootUrl: "https://x.com",
      pages,
      crawl: { discovered: 4, analyzed: 2, maxPages: 10, robotsAudit: null, sitemapAudit: { found: true, documents: [] } },
    });
    expect(withSitemap.notInSitemap).toEqual(["x.com/a"]);
    expect(withSitemap.coverage.ratio).toBe(0.5);
    expect(buildSiteIntelligence({ rootUrl: "https://x.com", pages }).notInSitemap).toEqual([]);
  });

  it("keeps business context only when it holds something", () => {
    const empty = buildSiteIntelligence({ rootUrl: "https://x.com", pages: [], business: { offerings: [], targetKeywords: [] } });
    expect(empty.business).toBeNull();
  });
});

describe("pageImportance", () => {
  const base = { isHomepage: false, depth: 1, inlinks: 0, maxInlinks: 10, pageType: null, indexable: true };

  it("ranks the homepage first and a noindexed page last", () => {
    expect(pageImportance({ ...base, isHomepage: true })).toBe(1);
    expect(pageImportance({ ...base, indexable: false })).toBeLessThan(pageImportance(base));
  });

  it("raises commercial pages and well-linked pages", () => {
    expect(pageImportance({ ...base, pageType: "pricing" })).toBeGreaterThan(pageImportance(base));
    expect(pageImportance({ ...base, inlinks: 10 })).toBeGreaterThan(pageImportance(base));
    expect(pageImportance({ ...base, pageType: "legal" })).toBeLessThan(pageImportance(base));
  });

  it("treats utility pages like legal ones: not a search entry point", () => {
    expect(pageImportance({ ...base, pageType: "utility" })).toBe(pageImportance({ ...base, pageType: "legal" }));
  });
});
