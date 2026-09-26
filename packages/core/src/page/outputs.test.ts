import { describe, expect, it } from "vitest";
import type { FixPlanInput } from "./fix-plan";
import { featuresForOutputs, pageOutputAvailability } from "./outputs";

function input(overrides: Partial<FixPlanInput> = {}): FixPlanInput {
  return {
    url: "https://example.com/",
    pageType: "homepage",
    pageTypeScore: 1,
    h1: "Acme Payments",
    wordCount: 600,
    contentLength: 4000,
    describableMissingAlt: 0,
    viewableMissingAlt: 0,
    missingAlt: 0,
    knownUrlCount: 5,
    failing: [{ checkId: "meta", status: "fail", severity: "high" }],
    ...overrides,
  };
}

describe("pageOutputAvailability", () => {
  it("offers every text output on a Priority page with content", () => {
    const availability = pageOutputAvailability(input());
    for (const output of ["analysis", "metadata", "content", "headings", "schema", "internal-links"] as const) {
      expect(availability[output].available).toBe(true);
    }
  });

  it("has nothing to analyse when every check passes", () => {
    expect(pageOutputAvailability(input({ failing: [] })).analysis.available).toBe(false);
  });

  it("points a Standard page at a Priority fetch instead of guessing", () => {
    const availability = pageOutputAvailability(input({ contentLength: 0, h1: null, crawlTier: "standard" }));
    expect(availability.content.available).toBe(false);
    expect(availability.content.reason).toMatch(/Priority/);
    expect(availability.metadata.available).toBe(false);
  });

  it("needs a known page type for structured data", () => {
    const availability = pageOutputAvailability(input({ pageType: "other", pageTypeScore: 0.3 }));
    expect(availability.schema.available).toBe(false);
  });

  it("offers alt text from the image itself when a provider can see it", () => {
    const availability = pageOutputAvailability(input({ missingAlt: 3, viewableMissingAlt: 2 }));
    expect(availability["alt-text"].available).toBe(true);
  });

  it("withholds alt text when nothing describes the images and none can be seen", () => {
    const availability = pageOutputAvailability(input({ missingAlt: 3 }));
    expect(availability["alt-text"].available).toBe(false);
  });

  it("says there is nothing to do when every image has alt text", () => {
    expect(pageOutputAvailability(input())["alt-text"].reason).toMatch(/Every image/);
  });

  it("needs enough other pages for internal links", () => {
    // A one-page Free crawl with no other known URLs.
    expect(pageOutputAvailability(input({ knownUrlCount: 1 }))["internal-links"].available).toBe(false);
  });
});

describe("featuresForOutputs", () => {
  it("maps metadata onto title and meta", () => {
    expect(featuresForOutputs(["metadata", "headings"])).toEqual(["title", "meta", "heading"]);
  });
});
