import { describe, expect, it } from "vitest";
import { type FixPlanInput, planFixes } from "./fix-plan";

function input(overrides: Partial<FixPlanInput> = {}): FixPlanInput {
  return {
    url: "https://x.com/page",
    contentLength: 5000,
    wordCount: 800,
    describableMissingAlt: 0,
    knownUrlCount: 20,
    failing: [],
    ...overrides,
  };
}

function planFor(checkId: string, overrides: Partial<FixPlanInput> = {}) {
  return planFixes(input({ ...overrides, failing: [{ checkId, status: "fail", severity: "high" }] }))[0];
}

describe("planFixes", () => {
  it("generates a canonical tag from the crawled address, not from AI", () => {
    const plan = planFor("canonical", { finalUrl: "https://x.com/page/" });
    expect(plan.strategy).toBe("deterministic");
    expect(plan.fix?.value).toBe('<link rel="canonical" href="https://x.com/page/" />');
  });

  it("only puts a Sitemap line in robots.txt when the crawl found a sitemap", () => {
    expect(planFor("robots").fix?.value).not.toMatch(/Sitemap/);
    expect(planFor("robots", { sitemapUrl: "https://x.com/sitemap.xml" }).fix?.value).toMatch(
      "Sitemap: https://x.com/sitemap.xml",
    );
  });

  it("does not invent a sitemap address", () => {
    const plan = planFor("sitemap");
    expect(plan.strategy).toBe("deterministic");
    expect(plan.fix).toBeNull();
  });

  it("routes title and meta to AI only when there is page text to write from", () => {
    expect(planFor("title").feature).toBe("title");
    expect(planFor("title", { contentLength: 0, h1: null }).strategy).toBe("blocked");
    expect(planFor("meta", { contentLength: 50 }).strategy).toBe("blocked");
  });

  it("blocks alt text when no image carries anything to describe it from", () => {
    const plan = planFor("images", { missingAlt: 4, describableMissingAlt: 0 });
    expect(plan.strategy).toBe("blocked");
    expect(plan.reason).toMatch(/cannot see images/);
  });

  it("allows alt suggestions for images with context, flagged for human review", () => {
    const plan = planFor("images", { missingAlt: 4, describableMissingAlt: 2 });
    expect(plan.feature).toBe("image-alt");
    expect(plan.reason).toMatch(/human check/);
  });

  it("generates schema only when the page type is known with confidence", () => {
    expect(planFor("schema", { pageType: "pricing", pageTypeScore: 0.75 }).feature).toBe("schema");
    expect(planFor("schema", { pageType: "other", pageTypeScore: 0.2 }).strategy).toBe("blocked");
  });

  it("needs real crawled pages before suggesting internal links", () => {
    expect(planFor("links", { knownUrlCount: 1 }).strategy).toBe("blocked");
    expect(planFor("links", { knownUrlCount: 40 }).feature).toBe("internal-link");
  });

  it("does not ask for links on a page with no captured text to place them in", () => {
    const plan = planFor("links", { knownUrlCount: 40, contentLength: 0 });
    expect(plan.strategy).toBe("blocked");
    expect(plan.reason).toMatch(/nowhere on the page/);
  });

  it("offers the matching side of a sitemap/noindex contradiction", () => {
    const legal = planFor("indexability", { robotsMeta: "noindex", inSitemap: true, pageType: "legal" });
    expect(legal.fix?.value).toMatch(/Remove .* from the sitemap/);
    const product = planFor("indexability", { robotsMeta: "noindex", inSitemap: true, pageType: "product" });
    expect(product.fix?.value).toMatch(/Remove "noindex"/);
  });
});
