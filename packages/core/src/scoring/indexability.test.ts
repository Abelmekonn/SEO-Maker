import { describe, expect, it } from "vitest";
import { indexabilityVerdict } from "./indexability";

describe("indexabilityVerdict", () => {
  it("passes an ordinary indexable page", () => {
    const verdict = indexabilityVerdict({ statusCode: 200, indexable: true, inSitemap: true });
    expect(verdict.status).toBe("pass");
    expect(verdict.reason).toBe("indexable");
  });

  it("fails a page that does not respond", () => {
    const verdict = indexabilityVerdict({ statusCode: 500, indexable: true });
    expect(verdict.status).toBe("fail");
    expect(verdict.reason).toBe("error-status");
  });

  /**
   * The stripe.com regression: 33 legal pages are noindex on purpose and were
   * all reported as Critical. They are not in the sitemap, so the site is
   * being consistent and there is nothing to report.
   */
  it("treats noindex outside the sitemap as intentional", () => {
    const verdict = indexabilityVerdict({
      statusCode: 200,
      indexable: false,
      inSitemap: false,
      pageType: "legal",
    });
    expect(verdict.status).toBe("pass");
    expect(verdict.intentional).toBe(true);
  });

  it("fails noindex on a page the sitemap advertises", () => {
    const verdict = indexabilityVerdict({ statusCode: 200, indexable: false, inSitemap: true });
    expect(verdict.status).toBe("fail");
    expect(verdict.reason).toBe("sitemap-conflict");
    expect(verdict.intentional).toBe(false);
  });

  it("fails a sitemap URL that robots.txt blocks", () => {
    const verdict = indexabilityVerdict({
      statusCode: 200,
      indexable: true,
      inSitemap: true,
      robotsDisallowed: true,
    });
    expect(verdict.status).toBe("fail");
    expect(verdict.reason).toBe("robots-conflict");
  });

  it("falls back to page type when the site publishes no sitemap", () => {
    expect(
      indexabilityVerdict({ statusCode: 200, indexable: false, inSitemap: null, pageType: "legal" })
        .status,
    ).toBe("pass");
  });

  it("warns rather than fails on noindex it cannot corroborate", () => {
    const verdict = indexabilityVerdict({
      statusCode: 200,
      indexable: false,
      inSitemap: null,
      pageType: "service",
    });
    expect(verdict.status).toBe("warning");
    expect(verdict.reason).toBe("unverified-noindex");
  });
});
