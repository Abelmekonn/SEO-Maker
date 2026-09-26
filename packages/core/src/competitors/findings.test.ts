import { describe, expect, it } from "vitest";
import type { CompetitorComparison } from "./compare";
import { summarizeSearchEvidence } from "./evidence";
import { describeCompetitorFindings } from "./findings";

describe("describeCompetitorFindings", () => {
  const search = summarizeSearchEvidence(
    [
      { id: "q1", query: "payment processing platform", intent: "commercial", relevance: 1, checked: true, selfPosition: 7, results: [{ position: 2, domain: "adyen.com", url: "https://adyen.com/payment-processing" }] },
      { id: "q2", query: "online payments", intent: "commercial", relevance: 1, checked: true, selfPosition: null, results: [{ position: 5, domain: "adyen.com", url: "https://adyen.com/online-payments" }] },
      { id: "q3", query: "billing software", intent: "commercial", relevance: 1, checked: true, selfPosition: null, results: [] },
    ],
    "adyen.com",
  );
  const comparison = {
    facts: [
      { id: "pt:pricing", kind: "page-type", favours: "competitor", statement: "", urls: ["https://adyen.com/pricing"], selfUrls: [] },
      { id: "links:avg", kind: "internal-links", favours: "self", statement: "", urls: [], selfUrls: [] },
    ],
    topicGaps: [],
  } as unknown as CompetitorComparison;

  it("states observed search evidence as observation", () => {
    const findings = describeCompetitorFindings({ domain: "adyen.com", search, pages: [], comparison: null });
    const text = findings.observed.map((row) => row.text);
    expect(text[0]).toBe("adyen.com appears in 2 of 3 analyzed searches.");
    expect(text).toContain('Its page /payment-processing appears at #2 for "payment processing platform".');
  });

  it("keeps opportunities separate, tied to a fact, and free of ranking promises", () => {
    const findings = describeCompetitorFindings({ domain: "adyen.com", search, pages: [], comparison });
    expect(findings.opportunities).toHaveLength(1);
    expect(findings.opportunities[0].factId).toBe("pt:pricing");
    for (const row of findings.opportunities) expect(row.text).not.toMatch(/rank #?1|will rank|guarantee/i);
  });

  it("says nothing about search when no search was checked", () => {
    const findings = describeCompetitorFindings({ domain: "adyen.com", search: null, pages: [{ url: "https://adyen.com/", pageType: "homepage", indexable: true, schemaTypes: ["Organization"] }], comparison: null });
    expect(findings.observed.every((row) => row.kind !== "search")).toBe(true);
    expect(findings.observed[0].text).toBe("1 page analyzed: 1 homepage page.");
  });
});
