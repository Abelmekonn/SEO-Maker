import { describe, expect, it } from "vitest";
import { type CheckedQuery, resultMatchesDomain, scoreQueryRelevance, summarizeSearchEvidence } from "./evidence";
import { termSet } from "../site/terms";

function query(id: string, overrides: Partial<CheckedQuery> = {}): CheckedQuery {
  return { id, query: `query ${id}`, intent: "commercial", relevance: 0.8, checked: true, selfPosition: null, results: [], ...overrides };
}

function result(position: number, domain: string, path = "/") {
  return { position, domain, url: `https://${domain}${path}` };
}

describe("summarizeSearchEvidence: shared searches", () => {
  it("counts a search you both appear in as shared", () => {
    const summary = summarizeSearchEvidence(
      [query("q1", { selfPosition: 7, results: [result(2, "adyen.com", "/payments"), result(7, "stripe.com")] })],
      "adyen.com",
    );
    expect(summary.appearanceCount).toBe(1);
    expect(summary.sharedQueryCount).toBe(1);
    expect(summary.rows[0]).toMatchObject({ position: 2, selfPosition: 7, url: "https://adyen.com/payments" });
  });

  it("does not count a search where only you appear", () => {
    const summary = summarizeSearchEvidence([query("q1", { selfPosition: 3, results: [result(3, "stripe.com")] })], "adyen.com");
    expect(summary.appearanceCount).toBe(0);
    expect(summary.sharedQueryCount).toBe(0);
    expect(summary.selfAppearanceCount).toBe(1);
  });

  it("counts a search it appears in even when you do not rank yet", () => {
    const summary = summarizeSearchEvidence([query("q1", { results: [result(4, "adyen.com")] })], "adyen.com");
    expect(summary.appearanceCount).toBe(1);
    expect(summary.sharedQueryCount).toBe(0);
  });

  it("ignores searches that were never checked", () => {
    const summary = summarizeSearchEvidence(
      [query("q1", { results: [result(1, "adyen.com")] }), query("q2", { checked: false })],
      "adyen.com",
    );
    expect(summary.queriesChecked).toBe(1);
    expect(summary.appearanceRate).toBe(1);
  });
});

describe("summarizeSearchEvidence: ranking visibility", () => {
  it("aggregates top 3, top 10 and top 20 appearances from the best position per search", () => {
    const summary = summarizeSearchEvidence(
      [
        query("q1", { results: [result(1, "adyen.com"), result(9, "adyen.com", "/other")] }),
        query("q2", { results: [result(3, "docs.adyen.com")] }),
        query("q3", { results: [result(8, "adyen.com")] }),
        query("q4", { results: [result(15, "adyen.com")] }),
        query("q5", { results: [result(2, "stripe.com")] }),
      ],
      "adyen.com",
    );
    expect(summary).toMatchObject({ queriesChecked: 5, appearanceCount: 4, top3: 2, top10: 3, top20: 4, bestPosition: 1 });
    expect(summary.positions).toEqual([1, 3, 8, 15]);
    expect(summary.avgPosition).toBeCloseTo(6.75, 5);
  });
});

describe("resultMatchesDomain", () => {
  it("matches the site and its subdomains, not look-alikes", () => {
    expect(resultMatchesDomain("docs.adyen.com", "adyen.com")).toBe(true);
    expect(resultMatchesDomain("adyen.com", "adyen.com")).toBe(true);
    expect(resultMatchesDomain("notadyen.com", "adyen.com")).toBe(false);
  });
});

describe("scoreQueryRelevance", () => {
  const business = termSet("payments billing invoicing subscriptions online checkout");

  it("scores a search about what the business sells highly, ignoring the place", () => {
    expect(scoreQueryRelevance("online payment processing Ethiopia", business)).toBeGreaterThanOrEqual(0.9);
  });

  it("scores an unrelated search low", () => {
    expect(scoreQueryRelevance("wedding dress shops", business)).toBe(0);
  });

  it("is unknown without a business to compare with", () => {
    expect(scoreQueryRelevance("payment gateway", new Set())).toBeNull();
  });
});
