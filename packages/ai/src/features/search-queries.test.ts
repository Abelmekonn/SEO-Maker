import { describe, expect, it } from "vitest";
import { searchQueriesSchema } from "../schemas";
import { type SearchQueryProfile, searchQueriesSpec } from "./search-queries";

const profile: SearchQueryProfile = {
  site: { name: "stripe.com", domain: "stripe.com", language: "en" },
  business: {
    name: "Stripe",
    type: "SaaS",
    industry: "Financial technology",
    description: "Payments infrastructure for online businesses.",
    audience: "Online businesses",
    servicesProducts: ["Payments", "Billing"],
    primaryGoal: null,
    targetKeywords: [],
  },
  market: { scope: "global", country: "United States", location: "Global (mainly United States)" },
  pages: [{ path: "/", title: "Stripe | Payments", h1: "Financial infrastructure" }],
};

function output(queries: Array<{ query: string; intent: string; priority: string; reason?: string }>) {
  return searchQueriesSchema.parse({
    queries: queries.map((row) => ({ reason: "Why", ...row })),
    groundedIn: ["business.servicesProducts"],
    confidence: "medium",
    needsHumanReview: false,
  });
}

describe("searchQueriesSpec", () => {
  const spec = searchQueriesSpec(profile, ["stripe"]);

  it("validates model output: normalizes case in intent and priority", () => {
    const parsed = output([{ query: "online payment platform", intent: "Commercial", priority: "HIGH" }]);
    expect(parsed.queries[0]).toMatchObject({ intent: "commercial", priority: "high" });
  });

  it("rejects malformed output at the schema", () => {
    expect(searchQueriesSchema.safeParse({ queries: "payments", groundedIn: ["x"], confidence: "high", needsHumanReview: false }).success).toBe(false);
    expect(searchQueriesSchema.safeParse({ queries: [{ query: "a b", intent: "sales", priority: "high", reason: "r" }], groundedIn: ["x"], confidence: "high", needsHumanReview: false }).success).toBe(false);
  });

  it("keeps valid searches and drops brand, duplicate and navigational ones", () => {
    const result = spec.refine!(
      output([
        { query: "online payment platform", intent: "commercial", priority: "high" },
        { query: "Online Payment Platform", intent: "commercial", priority: "high" },
        { query: "stripe pricing", intent: "commercial", priority: "high" },
        { query: "payment gateway login", intent: "navigational", priority: "low" },
        { query: "subscription billing software", intent: "commercial", priority: "medium" },
        { query: "accept card payments online", intent: "transactional", priority: "high" },
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.queries.map((row) => row.query)).toEqual([
        "online payment platform",
        "accept card payments online",
        "subscription billing software",
      ]);
    }
  });

  it("fails when too few usable searches survive, instead of storing a thin set", () => {
    const result = spec.refine!(
      output([
        { query: "stripe", intent: "commercial", priority: "high" },
        { query: "stripe login", intent: "navigational", priority: "high" },
        { query: "online payment platform", intent: "commercial", priority: "high" },
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it("puts only the profile in the prompt, and asks for the market language", () => {
    const prompt = spec.buildPrompt("");
    expect(prompt.user).toContain('"servicesProducts"');
    expect(prompt.user).toContain("# LANGUAGE\nen");
    expect(prompt.system).toMatch(/Never state search volumes/);
    expect(spec.evidence).not.toHaveProperty("rankings");
  });
});
