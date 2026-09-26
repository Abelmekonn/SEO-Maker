import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_QUERIES,
  brandTerms,
  discoveryProfileGaps,
  googleSearchUrl,
  normalizeSearchQuery,
  sanitizeSearchQueries,
} from "./queries";

function q(query: string, overrides: Partial<{ intent: string; priority: string; reason: string }> = {}) {
  return { query, intent: "commercial", priority: "high", reason: "Core service", ...overrides };
}

describe("sanitizeSearchQueries", () => {
  it("normalizes and keeps good searches", () => {
    const { kept } = sanitizeSearchQueries([q('  "Payment Gateway for SaaS?" ')]);
    expect(kept).toEqual([{ query: "payment gateway for saas", intent: "commercial", priority: "high", reason: "Core service" }]);
  });

  it("removes duplicates, including the same words in another order", () => {
    const { kept, dropped } = sanitizeSearchQueries([
      q("online payment processing"),
      q("Online payment processing"),
      q("payment processing online"),
      q("subscription billing software"),
    ]);
    expect(kept.map((row) => row.query)).toEqual(["online payment processing", "subscription billing software"]);
    expect(dropped.filter((row) => row.reason === "duplicate")).toHaveLength(2);
  });

  it("rejects empty, single-word, over-long and stuffed searches", () => {
    const { kept, dropped } = sanitizeSearchQueries([
      q(""),
      q("payments"),
      q("payment gateway payment gateway best payment"),
      q("one two three four five six seven eight nine ten"),
      q("payments, billing, invoicing"),
    ]);
    expect(kept).toEqual([]);
    expect(dropped.map((row) => row.reason)).toEqual([
      "empty or too short",
      "a single word is too broad",
      "repeats a word (keyword stuffing)",
      "too long to be one search",
      "a list of keywords, not a search",
    ]);
  });

  it("rejects searches for the business's own brand", () => {
    const brands = brandTerms({ businessName: "Stripe", domain: "stripe.com" });
    const { kept } = sanitizeSearchQueries([q("stripe payments"), q("stripe alternatives"), q("online payment platform")], { brandTerms: brands });
    expect(kept.map((row) => row.query)).toEqual(["online payment platform"]);
  });

  it("rejects unsupported intents and priorities", () => {
    const { kept } = sanitizeSearchQueries([
      q("payment gateway login", { intent: "navigational" }),
      q("payment gateway pricing", { priority: "urgent" }),
      q("payment gateway comparison", { intent: "Commercial", priority: "Medium" }),
    ]);
    expect(kept).toEqual([{ query: "payment gateway comparison", intent: "commercial", priority: "medium", reason: "Core service" }]);
  });

  it("enforces the maximum, keeping high priority first", () => {
    const raw = Array.from({ length: 20 }, (_, index) =>
      q(`payment search number ${String.fromCharCode(97 + index)}${String.fromCharCode(97 + index)}`, { priority: index % 2 ? "low" : "high" }),
    );
    const { kept } = sanitizeSearchQueries(raw);
    expect(kept).toHaveLength(MAX_SEARCH_QUERIES);
    expect(kept.slice(0, 10).every((row) => row.priority === "high")).toBe(true);
  });

  it("survives malformed rows without throwing", () => {
    const { kept, dropped } = sanitizeSearchQueries([{ query: 42 as unknown as string, intent: "commercial", priority: "high", reason: "x" }]);
    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(1);
  });
});

describe("normalizeSearchQuery", () => {
  it("collapses whitespace, strips quotes and trailing punctuation", () => {
    expect(normalizeSearchQuery("  “Best  CRM”  for startups!! ")).toBe("best crm for startups");
  });
});

describe("discoveryProfileGaps", () => {
  const complete = {
    name: "Stripe",
    businessType: "SaaS",
    industry: "Fintech",
    businessDescription: "Payments infrastructure for the internet.",
    targetAudience: "Online businesses",
    targetLocation: "Global (mainly United States)",
    servicesProducts: ["Payments", "Billing"],
  };

  it("accepts a complete profile", () => {
    expect(discoveryProfileGaps(complete)).toEqual([]);
  });

  it("lists every missing field", () => {
    const gaps = discoveryProfileGaps({ ...complete, businessType: null, industry: null, targetAudience: "", servicesProducts: [], businessDescription: null });
    expect(gaps.map((gap) => gap.field)).toEqual(["businessType", "targetAudience", "servicesProducts", "businessDescription"]);
  });

  it("asks for a country rather than assuming one", () => {
    expect(discoveryProfileGaps({ ...complete, targetLocation: null })[0].field).toBe("targetLocation");
    const global = discoveryProfileGaps({ ...complete, targetLocation: "Worldwide" });
    expect(global[0].hint).toMatch(/Global \(mainly United States\)/);
    expect(discoveryProfileGaps({ ...complete, targetLocation: "London" })[0].hint).toMatch(/does not name a country/);
  });
});

describe("googleSearchUrl", () => {
  it("links to a search for exactly the query, encoded", () => {
    expect(googleSearchUrl("payment processing for SaaS & startups")).toBe(
      "https://www.google.com/search?q=payment%20processing%20for%20SaaS%20%26%20startups",
    );
    expect(googleSearchUrl("café near me?")).toBe("https://www.google.com/search?q=caf%C3%A9%20near%20me%3F");
  });
});
