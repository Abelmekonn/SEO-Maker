import { compareWithCompetitor } from "@seo-maker/core/competitors";
import { buildSiteIntelligence, deriveSiteOpportunities } from "@seo-maker/core/site";
import { describe, expect, it } from "vitest";
import { competitorInsightSchema } from "../schemas";
import { competitorInsightSpec } from "./competitor";
import { numbersIn, ungroundedNumbers } from "./grounding";
import { siteOpportunitySpec } from "./site";

const base = { groundedIn: ["check:meta"], confidence: "medium" as const, needsHumanReview: false };

function fixture() {
  const page = (path: string, extra: Record<string, unknown> = {}) => ({
    id: path,
    url: `https://x.com${path}`,
    finalUrl: null,
    status: "analyzed",
    statusCode: 200,
    pageType: "service",
    searchIntent: null,
    title: `${path} title`,
    metaDesc: null,
    h1: null,
    wordCount: 500,
    internalLinks: 3,
    canonicalUrl: null,
    indexable: true,
    inSitemap: null,
    robotsDisallowed: null,
    depth: 1,
    discoveredVia: "link",
    contentHash: null,
    evidence: null,
    issues: [{ checkId: "meta", status: "fail", severity: "high" }],
    content: "SECRET PAGE BODY",
    ...extra,
  });
  const intel = buildSiteIntelligence({
    rootUrl: "https://x.com",
    pages: [page("/", { depth: 0, pageType: "homepage" }), page("/a"), page("/b")],
  });
  return { intel, candidates: deriveSiteOpportunities(intel) };
}

describe("siteOpportunitySpec", () => {
  const { intel, candidates } = fixture();
  const spec = siteOpportunitySpec(intel, candidates, null);
  const meta = candidates.find((row) => row.key === "check:meta")!;
  const entry = (overrides: Record<string, string> = {}) => ({
    id: "check:meta",
    title: "Write descriptions for your 3 pages",
    rationale: "r",
    evidence: "3 pages lack a description.",
    action: "a",
    nextStep: "n",
    ...overrides,
  });

  it("sends facts and counts, never page bodies", () => {
    const user = spec.buildPrompt("").user;
    expect(user).toContain("check:meta");
    expect(user).not.toContain("SECRET PAGE BODY");
    expect(user).toMatch(/Quick mode/);
  });

  it("keeps wording only for ids it offered, once each", () => {
    const result = spec.refine!({
      ...base,
      summary: "s",
      opportunities: [entry(), entry({ title: "dup" }), entry({ id: "invented:thing" })],
    });
    expect(result.ok && result.data.opportunities.map((row) => row.id)).toEqual(["check:meta"]);
  });

  it("falls back to the deterministic wording when a number is invented", () => {
    const result = spec.refine!({
      ...base,
      summary: "s",
      opportunities: [entry({ title: "Fix 40 pages missing descriptions", evidence: "40 pages lack one." })],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.opportunities[0].title).toBe(meta.title);
      expect(result.data.opportunities[0].evidence).toBe(meta.facts.slice(0, 2).join(" "));
    }
  });

  it("rejects output that matches none of the offered ids", () => {
    expect(spec.refine!({ ...base, summary: "s", opportunities: [entry({ id: "nope" })] }).ok).toBe(false);
  });

  it("routes knowledge by the candidates' checks", () => {
    expect(spec.knowledge.checks).toContain("meta");
  });
});

describe("competitorInsightSpec", () => {
  const insight = { ...base, structuralDifferences: [], opportunities: [] };
  const { intel } = fixture();
  const comparison = compareWithCompetitor({
    domain: "them.com",
    self: intel,
    competitorPages: [
      { url: "https://them.com/pricing", title: "Pricing", h1: "Pricing plans", wordCount: 900, internalLinks: 40, pageType: "pricing", schemaTypes: ["FAQPage"], headings: [] },
    ],
  });
  const quick = competitorInsightSpec(comparison, intel, null);
  const factId = comparison.facts.find((fact) => fact.kind === "page-type")!.id;

  it("keeps interpretations of real facts, on the right side", () => {
    const result = quick.refine!({
      ...insight,
      summary: "s",
      strengths: [{ factId, interpretation: "They have pricing." }, { factId: "made:up", interpretation: "x" }],
      weaknesses: [{ factId, interpretation: "Wrong side." }],
      gaps: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.strengths.map((row) => row.factId)).toEqual([factId]);
      expect(result.data.weaknesses).toEqual([]);
    }
  });

  it("takes a gap's kind from its fact, and never says yes without business context", () => {
    const result = quick.refine!({
      ...insight,
      summary: "s",
      strengths: [],
      weaknesses: [],
      gaps: [{ factId, kind: "topic", interpretation: "i", recommendation: "r", worthPursuing: "yes", reason: "r" }],
    });
    expect(result.ok && result.data.gaps[0]).toMatchObject({ kind: "page-type", worthPursuing: "maybe" });

    const deep = competitorInsightSpec(comparison, intel, { name: "X" }).refine!({
      ...insight,
      summary: "s",
      strengths: [],
      weaknesses: [],
      gaps: [{ factId, kind: "page-type", interpretation: "i", recommendation: "r", worthPursuing: "yes", reason: "r" }],
    });
    expect(deep.ok && deep.data.gaps[0].worthPursuing).toBe("yes");
  });

  it("keeps structural differences and opportunities only when they cite real facts", () => {
    const result = quick.refine!({
      ...insight,
      summary: "s",
      strengths: [],
      weaknesses: [],
      gaps: [],
      structuralDifferences: [
        { factId, interpretation: "They publish a pricing page." },
        { factId: "made:up", interpretation: "x" },
      ],
      opportunities: [
        { factIds: [factId, "made:up"], title: "Publish pricing", action: "a", worthPursuing: "yes", reason: "r" },
        { factIds: ["made:up"], title: "Invented", action: "a", worthPursuing: "maybe", reason: "r" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.structuralDifferences.map((row) => row.factId)).toEqual([factId]);
      expect(result.data.opportunities).toHaveLength(1);
      expect(result.data.opportunities[0]).toMatchObject({ factIds: [factId], worthPursuing: "maybe" });
    }
  });

  it("still reads a stored insight from before structural differences existed", () => {
    const parsed = competitorInsightSchema.parse({ ...base, summary: "s", strengths: [], weaknesses: [], gaps: [] });
    expect(parsed.structuralDifferences).toEqual([]);
    expect(parsed.opportunities).toEqual([]);
  });

  it("rejects an answer that interprets none of the facts", () => {
    const result = quick.refine!({ ...insight, summary: "s", strengths: [{ factId: "nope", interpretation: "x" }], weaknesses: [], gaps: [] });
    expect(result.ok).toBe(false);
  });
});

describe("number grounding", () => {
  it("reads thousands separators and decimals, and not list commas", () => {
    expect([...numbersIn("1,555 words, 2.5 s, pages 3, 4")]).toEqual(["1555", "2.5", "3", "4"]);
  });

  it("names the numbers the evidence does not contain", () => {
    expect(ungroundedNumbers("Fix 12 of 40 pages in 1 step", "12 pages fail")).toEqual(["40"]);
  });
});
