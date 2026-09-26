import { describe, expect, it } from "vitest";
import { type CompetitorPageFacts, measureBusinessSimilarity, normalizeBusinessType, profileCompetitorBusiness } from "./business";

function page(overrides: Partial<CompetitorPageFacts>): CompetitorPageFacts {
  return { url: "https://rival.com/", title: null, h1: null, headings: [], schemaTypes: [], pageType: "other", ...overrides };
}

const adyenPages = [
  page({ url: "https://adyen.com/", title: "Adyen | Online payments and financial products", h1: "Payments for ambitious businesses", pageType: "homepage", headings: ["Accept payments online and in person", "Billing and subscriptions"] }),
  page({ url: "https://adyen.com/payment-methods", title: "Payment methods | Adyen", h1: "Payment methods", pageType: "product", headings: ["Cards", "Wallets", "Checkout"] }),
  page({ url: "https://adyen.com/pricing", title: "Pricing | Adyen", h1: "Transparent payment pricing", pageType: "pricing" }),
];

const stripe = {
  businessType: "SaaS",
  industry: "Financial technology",
  description: "We help online businesses accept payments and manage subscriptions.",
  audience: "Online retailers",
  offerings: ["Payments", "Billing", "Invoicing", "Checkout"],
  targetKeywords: [],
  siteTerms: [],
};

describe("normalizeBusinessType", () => {
  it("maps what users type to a business family", () => {
    expect(normalizeBusinessType("SaaS")).toBe("saas");
    expect(normalizeBusinessType("Dental clinic")).toBe("local-service");
    expect(normalizeBusinessType("Online shop")).toBe("ecommerce");
    expect(normalizeBusinessType("Digital marketing agency")).toBe("agency");
    expect(normalizeBusinessType("Something unusual")).toBe("other");
    expect(normalizeBusinessType(null, "")).toBeNull();
  });
});

describe("profileCompetitorBusiness", () => {
  it("reads the family from schema.org first", () => {
    const profile = profileCompetitorBusiness([page({ schemaTypes: ["SoftwareApplication"] })]);
    expect(profile.family).toBe("saas");
    expect(profile.familyEvidence[0]).toMatch(/SoftwareApplication/);
  });

  it("falls back to page types and measures how commercial the site is", () => {
    const profile = profileCompetitorBusiness(adyenPages);
    expect(profile.family).toBe("saas");
    expect(profile.commercialShare).toBe(1);
    expect(profile.terms.has("payment")).toBe(true);
  });
});

describe("measureBusinessSimilarity", () => {
  it("scores a rival selling the same thing highly, from both sites' own words", () => {
    const result = measureBusinessSimilarity({ domain: "adyen.com", self: stripe, competitor: profileCompetitorBusiness(adyenPages) });
    expect(result.fromContent).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.evidence?.sharedTerms).toContain("payment");
  });

  it("scores an unrelated business low", () => {
    const bakery = profileCompetitorBusiness([
      page({ title: "Fresh bread and cakes | Bakery", h1: "Sourdough baked daily", pageType: "homepage", headings: ["Wedding cakes", "Pastries and croissants"] }),
    ]);
    const result = measureBusinessSimilarity({ domain: "bakery.com", self: stripe, competitor: bakery });
    expect(result.score).toBeLessThan(0.3);
  });

  it("falls back to your site's topics when the business context is empty", () => {
    const result = measureBusinessSimilarity({
      domain: "adyen.com",
      self: { businessType: null, industry: null, description: null, audience: null, offerings: [], targetKeywords: [], siteTerms: ["payment", "checkout", "billing", "invoice"] },
      competitor: profileCompetitorBusiness(adyenPages),
    });
    expect(result.evidence?.basis).toBe("your-site");
    expect(result.score).not.toBeNull();
  });

  it("explains why when nothing is known about your business", () => {
    const result = measureBusinessSimilarity({
      domain: "adyen.com",
      self: { businessType: null, industry: null, description: null, audience: null, offerings: [], targetKeywords: [], siteTerms: [] },
      competitor: profileCompetitorBusiness(adyenPages),
    });
    expect(result.score).toBeNull();
    expect(result.fromContent).toBe(false);
    expect(result.reason).toMatch(/Not enough is known about your business/);
  });
});
