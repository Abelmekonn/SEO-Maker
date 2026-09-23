import { describe, expect, it } from "vitest";
import {
  MAX_SELECTED_PAGES,
  type SelectablePage,
  inboundLinkCounts,
  pageImportance,
  selectImportantPages,
} from "./page-selection";

function page(overrides: Partial<SelectablePage> = {}): SelectablePage {
  return {
    id: "p1",
    url: "https://example.com/",
    status: "analyzed",
    statusCode: 200,
    pageType: "other",
    pageTypeScore: 0.7,
    depth: 1,
    inSitemap: true,
    wordCount: 600,
    schemaCount: 1,
    content: "Some real content on the page.",
    evidence: null,
    ...overrides,
  };
}

function linkTo(...hrefs: string[]) {
  return {
    links: hrefs.map((href) => ({ href, anchor: "x", internal: true, rel: [], empty: false })),
  };
}

describe("inboundLinkCounts", () => {
  it("counts links pointing at a page, not links leaving it", () => {
    const pages = [
      page({ id: "home", url: "https://example.com/", evidence: linkTo("https://example.com/seo") }),
      page({ id: "about", url: "https://example.com/about", evidence: linkTo("https://example.com/seo") }),
      page({ id: "seo", url: "https://example.com/seo", evidence: linkTo("https://example.com/") }),
    ];
    const counts = inboundLinkCounts(pages);
    expect(counts.get("seo")).toBe(2);
    expect(counts.get("home")).toBe(1);
    expect(counts.get("about")).toBeUndefined();
  });

  it("ignores self-links and counts a repeated target once per page", () => {
    const pages = [
      page({
        id: "home",
        url: "https://example.com/",
        evidence: linkTo(
          "https://example.com/",
          "https://example.com/seo",
          "https://example.com/seo",
          "https://example.com/seo",
        ),
      }),
      page({ id: "seo", url: "https://example.com/seo", evidence: null }),
    ];
    const counts = inboundLinkCounts(pages);
    expect(counts.get("home")).toBeUndefined();
    expect(counts.get("seo")).toBe(1);
  });

  it("matches targets whose URL is written differently", () => {
    const pages = [
      page({ id: "home", url: "https://example.com/", evidence: linkTo("https://example.com/seo/") }),
      page({ id: "seo", url: "https://example.com/seo", evidence: null }),
    ];
    expect(inboundLinkCounts(pages).get("seo")).toBe(1);
  });
});

describe("pageImportance", () => {
  const context = { inbound: 0, p90Inbound: 10 };

  it("ranks a homepage above a legal page", () => {
    const home = pageImportance(page({ pageType: "homepage", depth: 0 }), context);
    const legal = pageImportance(page({ pageType: "legal", depth: 0 }), context);
    expect(home).toBeGreaterThan(legal);
  });

  // A missing signal takes a stated neutral value. Treating null as zero would
  // punish pages for facts the crawl simply did not record.
  it("treats missing signals as neutral rather than zero", () => {
    const unknown = pageImportance(
      page({ depth: null, inSitemap: null, wordCount: null, schemaCount: null }),
      context,
    );
    const worst = pageImportance(
      page({ depth: 9, inSitemap: false, wordCount: 0, schemaCount: 0 }),
      context,
    );
    expect(unknown).toBeGreaterThan(worst);
  });

  it("rewards inbound links", () => {
    const linked = pageImportance(page(), { inbound: 10, p90Inbound: 10 });
    const orphan = pageImportance(page(), { inbound: 0, p90Inbound: 10 });
    expect(linked - orphan).toBeCloseTo(20, 5);
  });

  it("never exceeds 100", () => {
    const best = pageImportance(
      page({ pageType: "homepage", pageTypeScore: 1, depth: 0, wordCount: 5000, schemaCount: 9 }),
      { inbound: 99, p90Inbound: 10 },
    );
    expect(best).toBeLessThanOrEqual(100);
  });
});

describe("selectImportantPages", () => {
  function site(count: number, type: string, prefix: string): SelectablePage[] {
    return Array.from({ length: count }, (_, index) =>
      page({
        id: `${prefix}${index}`,
        url: `https://example.com/${prefix}/${index}`,
        pageType: type,
        depth: 2,
      }),
    );
  }

  it("excludes pages that were never successfully read", () => {
    const result = selectImportantPages(
      [
        page({ id: "ok" }),
        page({ id: "pending", status: "pending" }),
        page({ id: "error", statusCode: 500 }),
        page({ id: "empty", content: null }),
      ],
      { mode: "quick" },
    );
    expect(result.selected.map((entry) => entry.id)).toEqual(["ok"]);
    expect(result.deferred).toHaveLength(0);
  });

  it("always includes the homepage even when it ranks low", () => {
    const pages = [
      page({ id: "home", pageType: "homepage", depth: 4, wordCount: 20, inSitemap: false, schemaCount: 0 }),
      ...site(60, "article", "a"),
    ];
    const result = selectImportantPages(pages, { mode: "quick" });
    expect(result.selected.some((entry) => entry.id === "home")).toBe(true);
  });

  // The failure this guards: a blog-heavy site whose thirty slots all go to
  // articles, leaving Entity Clarity and Service Coverage nothing to measure.
  it("reserves room for service pages on a blog-heavy site", () => {
    const pages = [
      page({ id: "home", pageType: "homepage", depth: 0 }),
      ...site(80, "article", "a"),
      ...site(5, "service", "s"),
    ];
    const result = selectImportantPages(pages, { mode: "quick" });
    const services = result.selected.filter((entry) => entry.pageType === "service");
    expect(services).toHaveLength(5);
    expect(result.selected).toHaveLength(MAX_SELECTED_PAGES.quick);
  });

  it("caps at the mode limit and defers the rest with their scores", () => {
    const pages = site(80, "article", "a");
    const result = selectImportantPages(pages, { mode: "quick" });
    expect(result.selected).toHaveLength(MAX_SELECTED_PAGES.quick);
    expect(result.deferred).toHaveLength(80 - MAX_SELECTED_PAGES.quick);
    expect(result.deferred[0]!.importance).toBeGreaterThan(0);
  });

  it("takes more pages in deep mode", () => {
    const pages = site(80, "article", "a");
    expect(selectImportantPages(pages, { mode: "deep" }).selected).toHaveLength(
      MAX_SELECTED_PAGES.deep,
    );
  });

  it("skips legal pages unless the site has almost nothing else", () => {
    const busy = selectImportantPages(
      [...site(10, "article", "a"), ...site(3, "legal", "l")],
      { mode: "quick" },
    );
    expect(busy.selected.some((entry) => entry.pageType === "legal")).toBe(false);

    const sparse = selectImportantPages(
      [page({ id: "home", pageType: "homepage" }), ...site(2, "legal", "l")],
      { mode: "quick" },
    );
    expect(sparse.selected.some((entry) => entry.pageType === "legal")).toBe(true);
  });

  it("returns empty results for a site with nothing readable", () => {
    const result = selectImportantPages([page({ status: "failed", content: null })], {
      mode: "quick",
    });
    expect(result.selected).toEqual([]);
    expect(result.deferred).toEqual([]);
  });
});
