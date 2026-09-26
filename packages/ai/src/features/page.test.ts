import { describe, expect, it } from "vitest";
import type { PageContext, SiteContext } from "../context";
import { pageFeatureSpec } from "./page";

function page(overrides: Partial<PageContext> = {}): PageContext {
  return {
    pageId: "p1",
    url: "https://x.com/payments",
    finalUrl: null,
    statusCode: 200,
    pageType: "product",
    pageTypeConfidence: 0.7,
    searchIntent: "commercial",
    searchIntentConfidence: 0.65,
    title: "Payments",
    metaDescription: null,
    h1: "Accept payments online",
    h1Count: 1,
    headings: [{ level: 2, text: "Global payments" }],
    canonicalUrl: null,
    indexable: true,
    robotsMeta: null,
    language: "en",
    wordCount: 900,
    contentExcerpt: "Accept payments online in 135 currencies. Our checkout converts more buyers.",
    imageCount: 3,
    missingAlt: 2,
    imagesWithContext: [],
    imagesMissingAlt: [
      { src: "https://x.com/a.png", filename: "checkout-flow", context: "", fetchable: true },
      { src: "https://x.com/b.png", filename: null, context: "", fetchable: true },
    ],
    internalLinkCount: 1,
    outgoingLinks: [{ href: "https://x.com/billing", anchor: "Billing" }],
    schemaTypes: [],
    issues: [],
    evidenceGaps: [],
    ...overrides,
  };
}

const site: SiteContext = {
  projectId: "proj",
  rootUrl: "https://x.com",
  name: "X",
  analysisMode: "deep",
  business: null,
  pageCount: 4,
  knownUrls: ["https://x.com/payments", "https://x.com/billing", "https://x.com/pricing", "https://x.com/docs"],
  knownPages: [
    { url: "https://x.com/payments", title: "Payments", pageType: "product", fetched: true },
    { url: "https://x.com/billing", title: "Billing", pageType: "product", fetched: true },
    { url: "https://x.com/pricing", title: "Pricing", pageType: "pricing", fetched: true },
    { url: "https://x.com/docs", title: "Docs", pageType: "documentation", fetched: true },
  ],
};

const base = { groundedIn: ["contentExcerpt"], confidence: "medium" as const, needsHumanReview: false };

describe("internal-link grounding", () => {
  const spec = pageFeatureSpec("internal-link", page(), site, null);

  it("offers only crawled pages this page does not already link to", () => {
    const targets = (spec.evidence.candidateTargets as Array<{ url: string }>).map((row) => row.url);
    expect(targets).toEqual(["https://x.com/pricing", "https://x.com/docs"]);
  });

  it("drops an invented target and keeps the real one", () => {
    const result = spec.refine!({
      ...base,
      suggestions: [
        { targetUrl: "https://x.com/pricing", anchorText: "pricing", placement: "p", reasoning: "r" },
        { targetUrl: "https://x.com/made-up", anchorText: "x", placement: "p", reasoning: "r" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { suggestions: unknown[] }).suggestions).toHaveLength(1);
    }
  });

  it("rejects the output when every target was invented", () => {
    const result = spec.refine!({
      ...base,
      suggestions: [{ targetUrl: "https://x.com/nope", anchorText: "x", placement: "p", reasoning: "r" }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("schema grounding", () => {
  const spec = pageFeatureSpec("schema", page(), site, null);
  const output = (jsonLd: Record<string, unknown>) => ({
    ...base,
    entityType: "Product",
    entityReasoning: "r",
    jsonLd,
    eligibleFeatures: [],
    missingRequiredProperties: [],
  });

  it("accepts JSON-LD whose @type matches the chosen entity", () => {
    expect(spec.refine!(output({ "@context": "https://schema.org", "@type": "Product" })).ok).toBe(true);
  });

  it("rejects JSON-LD without a schema.org context or with a different type", () => {
    expect(spec.refine!(output({ "@type": "Product" })).ok).toBe(false);
    expect(spec.refine!(output({ "@context": "https://schema.org", "@type": "Article" })).ok).toBe(false);
  });
});

describe("image-alt grounding", () => {
  const spec = pageFeatureSpec("image-alt", page(), site, null);

  it("keeps only offered images with a real basis and always asks for human review", () => {
    const result = spec.refine!({
      ...base,
      images: [
        { src: "https://x.com/a.png", alt: "Checkout flow", basis: "filename" },
        { src: "https://x.com/b.png", alt: "Guess", basis: "filename" },
        { src: "https://x.com/c.png", alt: "Not offered", basis: "caption" },
      ],
      skipped: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { images: Array<{ src: string }>; needsHumanReview: boolean };
      expect(data.images.map((row) => row.src)).toEqual(["https://x.com/a.png"]);
      expect(data.needsHumanReview).toBe(true);
    }
  });

  it("accepts alt text written from the image only when the image was sent", () => {
    const answer = {
      ...base,
      images: [{ src: "https://x.com/b.png", alt: "Dashboard showing monthly payouts", basis: "image" as const }],
      skipped: [],
    };
    const seen = spec.refine!(answer, { imagesSent: true });
    expect(seen.ok && (seen.data as { images: unknown[] }).images).toHaveLength(1);
    // A text-only provider claiming it looked at the image is inventing it.
    const unseen = spec.refine!(answer, { imagesSent: false });
    expect(unseen.ok && (unseen.data as { images: unknown[] }).images).toHaveLength(0);
  });

  it("tells a text-only model it cannot see the images, and a multimodal one that it can", () => {
    expect(spec.buildPrompt("", { imagesAttached: false }).user).toMatch(/CANNOT see these images/);
    expect(spec.buildPrompt("", { imagesAttached: true }).user).toMatch(/attached after this message/);
    expect(spec.imageRefs).toEqual(["https://x.com/a.png", "https://x.com/b.png"]);
  });
});

describe("content grounding", () => {
  it("drops an 'unclear section' that quotes text the page does not contain", () => {
    const spec = pageFeatureSpec("content", page(), site, null);
    const result = spec.refine!({
      ...base,
      missingTopics: [],
      outline: [],
      unclearSections: [
        { excerpt: "Our checkout converts more buyers.", problem: "vague", improvement: "say how" },
        { excerpt: "We are the best in the world.", problem: "p", improvement: "i" },
      ],
    });
    expect(result.ok && (result.data as { unclearSections: unknown[] }).unclearSections).toHaveLength(1);
  });
});

describe("business context", () => {
  it("tells the model not to guess the business in Quick mode", () => {
    const quick = pageFeatureSpec("title", page(), site, null).buildPrompt("").user;
    expect(quick).toMatch(/Quick mode/);
    const deep = pageFeatureSpec("title", page(), site, { name: "X Payments", primaryGoal: "sign-ups" }).buildPrompt("").user;
    expect(deep).toMatch(/X Payments/);
    expect(deep).not.toMatch(/Quick mode/);
  });
});
