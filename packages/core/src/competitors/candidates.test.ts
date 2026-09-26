import { describe, expect, it } from "vitest";
import { type CandidateResult, aggregateCandidates, minimumAppearances, selectStrongestCandidate } from "./candidates";

const queries = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map((id) => ({ id, query: `search ${id}`, relevance: 1 }));

function r(queryId: string, position: number, domain: string): CandidateResult {
  return { queryId, position, domain, url: `https://${domain}/${queryId}` };
}

describe("aggregateCandidates", () => {
  it("selects the strongest recurring domain, not the first result of the first search", () => {
    const results = [
      // A one-off winner of the first search.
      r("q1", 1, "oneoff.com"),
      // Recurs in 7 of 8 searches, mostly near the top.
      ...["q1", "q2", "q3", "q4", "q5", "q6", "q7"].map((id, index) => r(id, [2, 1, 3, 2, 4, 6, 9][index], "www.adyen.com")),
      // Recurs in 3 searches, lower down.
      r("q2", 6, "rival.com"),
      r("q5", 9, "rival.com"),
      r("q8", 11, "rival.com"),
    ];
    const aggregation = aggregateCandidates({ queries, results, selfDomain: "stripe.com" });
    const strongest = selectStrongestCandidate(aggregation);
    expect(strongest?.domain).toBe("adyen.com");
    expect(strongest).toMatchObject({ appearances: 7, queriesChecked: 8, top3: 4, top10: 7, bestPosition: 1 });
    expect(aggregation.candidates.map((c) => c.domain)).toEqual(["adyen.com", "rival.com", "oneoff.com"]);
    expect(aggregation.candidates.find((c) => c.domain === "oneoff.com")?.eligible).toBe(false);
  });

  it("never selects your own domain, even when it dominates", () => {
    const results = queries.map((q) => r(q.id, 1, "www.stripe.com")).concat([r("q1", 2, "adyen.com"), r("q2", 3, "adyen.com")]);
    const aggregation = aggregateCandidates({ queries, results, selfDomain: "https://stripe.com/" });
    expect(selectStrongestCandidate(aggregation)?.domain).toBe("adyen.com");
    expect(aggregation.excluded).toContainEqual({ domain: "stripe.com", reason: "Your own site", appearances: 8 });
  });

  it("sets aside platforms, directories and domains the user removed", () => {
    const results = [
      ...queries.map((q) => r(q.id, 1, "en.wikipedia.org")),
      ...queries.map((q) => r(q.id, 2, "www.youtube.com")),
      ...queries.map((q) => r(q.id, 3, "g2.com")),
      ...queries.map((q) => r(q.id, 4, "removed.com")),
      r("q1", 5, "adyen.com"),
      r("q2", 5, "adyen.com"),
    ];
    const aggregation = aggregateCandidates({ queries, results, selfDomain: "stripe.com", excludedDomains: ["removed.com"] });
    expect(selectStrongestCandidate(aggregation)?.domain).toBe("adyen.com");
    expect(aggregation.excluded.map((row) => row.domain).sort()).toEqual(["g2.com", "removed.com", "wikipedia.org", "youtube.com"]);
  });

  it("returns null when nothing recurs", () => {
    const aggregation = aggregateCandidates({ queries, results: [r("q1", 1, "a.com"), r("q2", 1, "b.com")], selfDomain: "stripe.com" });
    expect(selectStrongestCandidate(aggregation)).toBeNull();
  });

  it("weights searches by relevance", () => {
    const weighted = [
      { id: "q1", query: "core search", relevance: 1 },
      { id: "q2", query: "core search two", relevance: 1 },
      { id: "q3", query: "loosely related", relevance: 0.1 },
      { id: "q4", query: "loosely related two", relevance: 0.1 },
    ];
    const results = [r("q1", 2, "core.com"), r("q2", 2, "core.com"), r("q3", 1, "loose.com"), r("q4", 1, "loose.com")];
    const aggregation = aggregateCandidates({ queries: weighted, results, selfDomain: "self.com" });
    expect(selectStrongestCandidate(aggregation)?.domain).toBe("core.com");
  });
});

describe("minimumAppearances", () => {
  it("requires recurrence once four or more searches were checked", () => {
    expect(minimumAppearances(2)).toBe(1);
    expect(minimumAppearances(4)).toBe(2);
    expect(minimumAppearances(12)).toBe(2);
  });
});
