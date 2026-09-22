import { describe, expect, it } from "vitest";
import { planSeeds } from "./plan";
import { normalizePageUrl, sectionOf } from "./url";

const HOME = "https://example.com";

function urls(section: string, count: number, prefix = "") {
  return Array.from({ length: count }, (_, i) => `${HOME}/${section}/${prefix}page-${i}`);
}

describe("normalizePageUrl", () => {
  it("collapses trailing slashes, fragments and default ports", () => {
    expect(normalizePageUrl("https://example.com/a/")).toBe("https://example.com/a");
    expect(normalizePageUrl("https://example.com/a#top")).toBe("https://example.com/a");
    expect(normalizePageUrl("https://example.com:443/a")).toBe("https://example.com/a");
    expect(normalizePageUrl("https://example.com/")).toBe("https://example.com");
  });

  it("drops tracking parameters but keeps meaningful ones", () => {
    expect(normalizePageUrl("https://example.com/a?utm_source=x&id=7")).toBe(
      "https://example.com/a?id=7",
    );
    expect(normalizePageUrl("https://example.com/a?gclid=abc")).toBe("https://example.com/a");
  });

  it("orders query parameters so two spellings of one page collapse", () => {
    expect(normalizePageUrl("https://example.com/a?b=2&a=1")).toBe(
      normalizePageUrl("https://example.com/a?a=1&b=2"),
    );
  });

  it("rejects assets and non-http schemes", () => {
    expect(normalizePageUrl("https://example.com/doc.pdf")).toBeNull();
    expect(normalizePageUrl("https://example.com/app.js")).toBeNull();
    expect(normalizePageUrl("mailto:a@b.com")).toBeNull();
    expect(normalizePageUrl("not a url")).toBeNull();
  });
});

describe("planSeeds", () => {
  it("always seeds the homepage first", () => {
    const plan = planSeeds({
      start: HOME,
      sitemapUrls: urls("legal", 50),
      limit: 10,
      siteHost: "example.com",
    });
    expect(plan.seeds[0]).toBe(HOME);
  });

  /**
   * The stripe.com regression: the sitemap opens with hundreds of /legal URLs,
   * and slicing it in document order spent all 100 requests there.
   */
  it("does not let one section swallow the budget", () => {
    const plan = planSeeds({
      start: HOME,
      sitemapUrls: [
        ...urls("legal", 400),
        ...urls("payments", 30),
        ...urls("billing", 30),
        ...urls("pricing", 5),
      ],
      limit: 100,
      siteHost: "example.com",
    });

    const legal = plan.seeds.filter((url) => sectionOf(url) === "legal").length;
    expect(plan.seeds).toHaveLength(100);
    expect(legal).toBeLessThanOrEqual(35);
    expect(plan.sections).toEqual(
      expect.arrayContaining(["/", "legal", "payments", "billing", "pricing"]),
    );
  });

  it("spends the whole budget when the site really only has one section", () => {
    const plan = planSeeds({
      start: HOME,
      sitemapUrls: urls("legal", 400),
      limit: 100,
      siteHost: "example.com",
    });
    expect(plan.seeds).toHaveLength(100);
  });

  it("prefers shallow pages inside a section", () => {
    const plan = planSeeds({
      start: HOME,
      sitemapUrls: [
        "https://example.com/payments/a/b/c/deep",
        "https://example.com/payments/shallow",
      ],
      limit: 3,
      siteHost: "example.com",
    });
    expect(plan.seeds[1]).toBe("https://example.com/payments/shallow");
  });

  it("drops duplicates, other hosts and robots-blocked paths before spending budget", () => {
    const plan = planSeeds({
      start: HOME,
      sitemapUrls: [
        "https://example.com/a/",
        "https://example.com/a",
        "https://example.com/a#x",
        "https://other.com/b",
        "https://example.com/private/x",
      ],
      limit: 10,
      siteHost: "example.com",
      isDisallowed: (pathname) => pathname.startsWith("/private"),
    });

    expect(plan.duplicates).toBe(2);
    expect(plan.offSite).toBe(1);
    expect(plan.disallowed).toBe(1);
    expect(plan.seeds).toEqual([HOME, "https://example.com/a"]);
  });

  it("reports how many sitemap URLs did not fit", () => {
    const plan = planSeeds({
      start: HOME,
      sitemapUrls: urls("legal", 40),
      limit: 5,
      siteHost: "example.com",
    });
    expect(plan.seeds).toHaveLength(5);
    expect(plan.deferred).toBe(36);
  });

  it("never returns fewer seeds than the homepage", () => {
    const plan = planSeeds({ start: HOME, sitemapUrls: [], limit: 50, siteHost: "example.com" });
    expect(plan.seeds).toEqual([HOME]);
  });
});
