import { describe, expect, it } from "vitest";
import {
  internalLinkSchema,
  keepKnownUrls,
  pageRecommendationSchema,
  schemaFor,
  titleSchema,
} from "./index";

describe("structured output contracts", () => {
  it("accepts a well-formed page recommendation", () => {
    const parsed = pageRecommendationSchema.safeParse({
      summary: "The page is missing a meta description.",
      recommendations: [
        {
          checkId: "meta",
          issue: "No meta description element.",
          whyItMatters: "Google may use it when it describes the page better than the body text.",
          action: "Write a unique description covering the page's main points.",
          severity: "medium",
          actionable: true,
        },
      ],
      groundedIn: ["evidence.metaDescription", "seo-onpage-meta-description-criteria"],
      confidence: "high",
      needsHumanReview: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects output that cites no evidence", () => {
    // A recommendation grounded in nothing is exactly what the contract exists
    // to stop reaching storage.
    const parsed = pageRecommendationSchema.safeParse({
      summary: "Looks fine.",
      recommendations: [
        {
          checkId: "meta",
          issue: "x",
          whyItMatters: "y",
          action: "z",
          severity: "low",
          actionable: true,
        },
      ],
      groundedIn: [],
      confidence: "high",
      needsHumanReview: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown severity", () => {
    const parsed = pageRecommendationSchema.safeParse({
      summary: "s",
      recommendations: [
        {
          checkId: "meta",
          issue: "x",
          whyItMatters: "y",
          action: "z",
          severity: "catastrophic",
          actionable: true,
        },
      ],
      groundedIn: ["a"],
      confidence: "high",
      needsHumanReview: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires needsHumanReview on a title suggestion", () => {
    const parsed = titleSchema.safeParse({
      current: null,
      suggestions: [{ value: "A clear title", reasoning: "Describes the page." }],
      diagnosis: "The page has no title element.",
      groundedIn: ["evidence.title"],
      confidence: "medium",
    });
    expect(parsed.success).toBe(false);
  });

  it("exposes a schema for every feature", () => {
    expect(schemaFor("title")).toBe(titleSchema);
    expect(schemaFor("internal-link")).toBe(internalLinkSchema);
  });
});

describe("keepKnownUrls", () => {
  const known = ["https://example.com/pricing", "https://example.com/about/"];

  it("keeps targets the crawl actually found", () => {
    const { kept, dropped } = keepKnownUrls(
      [{ targetUrl: "https://example.com/pricing" }],
      known,
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("drops invented targets", () => {
    // Phase 2.3: "do not invent existing target URLs".
    const { kept, dropped } = keepKnownUrls(
      [{ targetUrl: "https://example.com/blog/seo-guide" }],
      known,
    );
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
  });

  it("ignores scheme, www and trailing slash when comparing", () => {
    const { kept } = keepKnownUrls(
      [{ targetUrl: "http://www.example.com/about" }],
      known,
    );
    expect(kept).toHaveLength(1);
  });
});
