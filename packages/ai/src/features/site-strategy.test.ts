import { buildSiteIntelligence, deriveSiteOpportunities } from "@seo-maker/core/site";
import { describe, expect, it } from "vitest";
import type { SiteStrategy } from "../schemas";
import { evidenceIds, siteStrategySpec, strategyEvidence } from "./site-strategy";

const base = { groundedIn: ["site"], confidence: "medium" as const, needsHumanReview: false };

function page(path: string, extra: Record<string, unknown> = {}) {
  return {
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
  };
}

function site(paths: string[]) {
  const intel = buildSiteIntelligence({
    rootUrl: "https://x.com",
    pages: [page("/", { depth: 0, pageType: "homepage" }), ...paths.map((path) => page(path))],
  });
  return { intel, candidates: deriveSiteOpportunities(intel) };
}

function answer(overrides: Partial<SiteStrategy> = {}): SiteStrategy {
  return {
    ...base,
    summary: "The site is small.",
    evidenceSufficient: true,
    contentOpportunities: [],
    topicStructure: { assessment: "a", clusters: [] },
    internalLinkStrategy: [],
    architectureRecommendations: [],
    contentStrategy: { focus: "f", priorities: [] },
    ...overrides,
  };
}

describe("siteStrategySpec", () => {
  const { intel, candidates } = site(["/services/a", "/services/b", "/about"]);
  const spec = siteStrategySpec(intel, candidates, null);

  it("sends labelled site evidence, never page bodies", () => {
    const user = spec.buildPrompt("").user;
    expect(user).toContain('"id": "links"');
    expect(user).toContain("page:/services/a");
    expect(user).not.toContain("SECRET PAGE BODY");
    expect(user).toMatch(/Do not guess the business/);
  });

  it("gives every section, page and opportunity an id", () => {
    const ids = evidenceIds(strategyEvidence(intel, candidates));
    expect(ids.has("page:/")).toBe(true);
    expect(ids.has("architecture")).toBe(true);
    expect([...ids].some((id) => id.startsWith("opp:"))).toBe(true);
  });

  it("drops recommendations that cite no known evidence", () => {
    const result = spec.refine!(
      answer({
        architectureRecommendations: [
          { recommendation: "Flatten the services section", rationale: "r", evidenceRefs: ["architecture"] },
          { recommendation: "Invented", rationale: "r", evidenceRefs: ["made:up"] },
        ],
      }),
    );
    expect(result.ok && result.data.architectureRecommendations.map((row) => row.recommendation)).toEqual([
      "Flatten the services section",
    ]);
  });

  it("removes page paths the crawl never found", () => {
    const result = spec.refine!(
      answer({
        internalLinkStrategy: [
          {
            recommendation: "Link the service pages to each other",
            rationale: "r",
            examplePages: ["/services/a", "/services/b", "/pricing-we-imagined"],
            evidenceRefs: ["links", "page:/services/a"],
          },
        ],
      }),
    );
    expect(result.ok && result.data.internalLinkStrategy[0].examplePages).toEqual(["/services/a", "/services/b"]);
  });

  it("drops a recommendation with a number the evidence does not contain", () => {
    const result = spec.refine!(
      answer({
        contentOpportunities: [
          { title: "Grow traffic by 300%", rationale: "r", action: "a", evidenceRefs: ["site"] },
          { title: "Add a guide", rationale: "r", action: "a", evidenceRefs: ["site"] },
        ],
      }),
    );
    expect(result.ok && result.data.contentOpportunities.map((row) => row.title)).toEqual(["Add a guide"]);
  });

  it("fails when nothing it recommended is grounded", () => {
    const result = spec.refine!(
      answer({ contentOpportunities: [{ title: "x", rationale: "r", action: "a", evidenceRefs: ["nope"] }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("marks the evidence insufficient on a one-page crawl whatever the model says", () => {
    const small = site([]);
    const result = siteStrategySpec(small.intel, small.candidates, null).refine!(answer({ evidenceSufficient: true }));
    expect(result.ok && result.data.evidenceSufficient).toBe(false);
  });
});
