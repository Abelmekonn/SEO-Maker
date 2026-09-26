import { describe, expect, it } from "vitest";
import { termSet } from "../site/terms";
import { selectCompetitorPages } from "./pages";

const terms = termSet("payment processing platform online payments checkout subscriptions billing");

describe("selectCompetitorPages", () => {
  const input = {
    homepageUrl: "https://adyen.com/",
    serp: [
      { url: "https://www.adyen.com/payment-processing", query: "payment processing platform", position: 2 },
      { url: "https://adyen.com/payment-processing#top", query: "online payment processing", position: 4 },
      { url: "https://other.com/payment-processing", query: "payment processing platform", position: 3 },
    ],
    links: [
      { url: "https://adyen.com/login", anchor: "Log in" },
      { url: "https://adyen.com/legal/terms", anchor: "Terms" },
      { url: "https://adyen.com/contact", anchor: "Contact us" },
      { url: "https://adyen.com/pricing", anchor: "Pricing" },
      { url: "https://adyen.com/online-payments", anchor: "Online payments" },
      { url: "https://adyen.com/careers", anchor: "Careers" },
      { url: "https://adyen.com/brochure.pdf", anchor: "Brochure" },
      { url: "https://adyen.com/de/online-payments", anchor: "Online-Zahlungen" },
    ],
    sitemap: [
      "https://adyen.com/blog/one",
      "https://adyen.com/blog/two",
      "https://adyen.com/blog/three",
      "https://adyen.com/blog/tag/payments",
      "https://adyen.com/checkout",
    ],
    terms,
    limit: 7,
  };

  it("starts with the homepage, then the pages that ranked in your searches", () => {
    const pages = selectCompetitorPages(input);
    expect(pages[0]).toMatchObject({ url: "https://adyen.com", source: "homepage" });
    expect(pages[1]).toMatchObject({ source: "serp", position: 2, query: "payment processing platform", reason: 'Ranks #2 for "payment processing platform"' });
  });

  it("deduplicates, and never selects another host, files, utility, legal or archive pages", () => {
    const urls = selectCompetitorPages(input).map((page) => page.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((url) => url.includes("payment-processing"))).toHaveLength(1);
    for (const skipped of ["other.com", "/login", "/legal/terms", "/contact", ".pdf", "/tag/"]) {
      expect(urls.some((url) => url.includes(skipped))).toBe(false);
    }
  });

  it("prefers relevant commercial pages over articles, and keeps articles few", () => {
    const pages = selectCompetitorPages(input);
    const urls = pages.map((page) => page.url);
    expect(urls).toContain("https://adyen.com/pricing");
    expect(urls).toContain("https://adyen.com/online-payments");
    expect(pages.filter((page) => page.pageType === "article").length).toBeLessThanOrEqual(2);
    expect(urls.indexOf("https://adyen.com/online-payments")).toBeLessThan(urls.indexOf("https://adyen.com/de/online-payments") === -1 ? Infinity : urls.indexOf("https://adyen.com/de/online-payments"));
  });

  it("respects the limit", () => {
    expect(selectCompetitorPages({ ...input, limit: 3 })).toHaveLength(3);
    expect(selectCompetitorPages({ ...input, limit: 1 })).toHaveLength(1);
  });
});
