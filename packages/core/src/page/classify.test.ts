import { describe, expect, it } from "vitest";
import { classifyPage, noindexIsExpected } from "./classify";
import {
  type ImageEvidence,
  contentFingerprint,
  countWords,
  hasAltEvidence,
  normalizeContent,
} from "./intelligence";

describe("classifyPage", () => {
  it("identifies the homepage from the root path", () => {
    expect(classifyPage({ url: "https://x.com/" }).type).toBe("homepage");
    expect(classifyPage({ url: "https://x.com" }).confidence).toBe(1);
  });

  it("prefers schema.org over the URL", () => {
    const result = classifyPage({ url: "https://x.com/blog/thing", schemaTypes: ["Product"] });
    expect(result.type).toBe("product");
  });

  it.each([
    ["https://stripe.com/legal/ssa", "legal"],
    ["https://x.com/privacy", "legal"],
    ["https://x.com/pricing", "pricing"],
    ["https://x.com/docs/api/charges", "documentation"],
    ["https://x.com/blog/hello-world", "article"],
    ["https://x.com/services/consulting", "service"],
    ["https://x.com/products/widget", "product"],
    ["https://x.com/about", "about"],
    ["https://x.com/contact", "contact"],
  ])("classifies %s as %s", (url, expected) => {
    expect(classifyPage({ url }).type).toBe(expected);
  });

  it("falls back to headings before giving up", () => {
    expect(classifyPage({ url: "https://x.com/z", h1: "Our Pricing" }).type).toBe("pricing");
  });

  it("returns low-confidence other when nothing is decisive", () => {
    const result = classifyPage({ url: "https://x.com/zzz" });
    expect(result.type).toBe("other");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("files login, account, cart and search pages as utility", () => {
    for (const path of ["/login", "/sign-in", "/account/orders", "/cart", "/checkout", "/search", "/wp-login.php"]) {
      expect(classifyPage({ url: `https://x.com${path}` }).type).toBe("utility");
    }
    // A sign-up page is where a campaign lands, not a utility.
    expect(classifyPage({ url: "https://x.com/signup" }).type).toBe("landing");
  });
});

describe("noindexIsExpected", () => {
  it("is true for page types usually kept out of search", () => {
    expect(noindexIsExpected("legal")).toBe(true);
    expect(noindexIsExpected("landing")).toBe(true);
  });

  it("is false for pages that should be indexed", () => {
    expect(noindexIsExpected("service")).toBe(false);
    expect(noindexIsExpected(null)).toBe(false);
  });
});

describe("content normalization", () => {
  it("collapses whitespace", () => {
    expect(normalizeContent("  a \n\n b  ")).toBe("a b");
  });

  it("counts words on normalized text", () => {
    expect(countWords(normalizeContent("one two   three"))).toBe(3);
    expect(countWords("")).toBe(0);
  });

  it("fingerprints content stably and distinguishes changes", () => {
    expect(contentFingerprint("hello")).toBe(contentFingerprint("hello"));
    expect(contentFingerprint("hello")).not.toBe(contentFingerprint("hellp"));
  });
});

describe("hasAltEvidence", () => {
  const image = (overrides: Partial<ImageEvidence> = {}): ImageEvidence => ({
    src: "https://x.com/a.png",
    alt: null,
    decorative: false,
    title: null,
    width: null,
    height: null,
    loading: null,
    filename: null,
    context: "",
    ...overrides,
  });

  it("accepts a real caption", () => {
    expect(hasAltEvidence(image({ context: "Our team standing outside the Berlin office" }))).toBe(
      true,
    );
  });

  it("accepts a descriptive filename", () => {
    expect(hasAltEvidence(image({ filename: "team photo berlin" }))).toBe(true);
  });

  /** The gate exists to stop invented alt text, so weak signals must not pass. */
  it("rejects a hashed asset name", () => {
    expect(hasAltEvidence(image({ filename: "" }))).toBe(false);
    expect(hasAltEvidence(image({ filename: "wave" }))).toBe(false);
  });

  it("rejects a near-empty context", () => {
    expect(hasAltEvidence(image({ context: "Learn more" }))).toBe(false);
  });

  it("rejects an image with nothing at all", () => {
    expect(hasAltEvidence(image())).toBe(false);
  });
});

describe("classifyPage Phase 2.4 signals", () => {
  it("does not file a pricing page under documentation because it has an FAQ block", () => {
    const result = classifyPage({ url: "https://stripe.com/pricing", schemaTypes: ["FAQPage"] });
    expect(result.type).toBe("pricing");
  });

  it("treats a path named after a listed offering as a product page", () => {
    const result = classifyPage({
      url: "https://stripe.com/payments",
      offerings: ["Payments", "Billing", "Connect"],
    });
    expect(result.type).toBe("product");
    expect(result.evidence.join(" ")).toMatch(/Payments/);
  });

  it("uses service when the business sells services", () => {
    const result = classifyPage({
      url: "https://agency.example/seo-audit",
      offerings: ["SEO audit"],
      offeringKind: "service",
    });
    expect(result.type).toBe("service");
  });

  it("ignores offerings nested under another section", () => {
    const result = classifyPage({ url: "https://stripe.com/legal/payments", offerings: ["Payments"] });
    expect(result.type).toBe("legal");
  });

  it("keeps CollectionPage as a weak category signal", () => {
    expect(classifyPage({ url: "https://x.com/zz", schemaTypes: ["CollectionPage"] }).type).toBe("category");
  });
});
