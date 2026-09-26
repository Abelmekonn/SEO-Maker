import { describe, expect, it } from "vitest";
import type { AiProvider, StructuredRequest, StructuredResponse } from "../provider";
import { BENCHMARK_CASES } from "./cases";
import { compareReports, formatReport, runBenchmark } from "./runner";
import { scoreOutput } from "./scorers";

const expectMeta = { specificTerms: ["bookkeeping"], current: null, diagnosisMissing: true };
const source = "Monthly bookkeeping for small businesses in Leeds from £149 a month.";

function metaOutput(value: string, reasoning = "Names the service, the market and the entry price from the page text.") {
  return {
    current: null,
    diagnosis: "No meta description on the page.",
    suggestions: [{ value, reasoning }],
    groundedIn: ["contentExcerpt", "currentMetaDescription"],
    confidence: "high",
    needsHumanReview: false,
  };
}

describe("scoreOutput", () => {
  const score = (output: Record<string, unknown>) =>
    scoreOutput({
      feature: "meta",
      output,
      evidence: { contentExcerpt: source, currentMetaDescription: null },
      sourceText: source,
      knowledgeIds: [],
      expect: expectMeta,
      businessProvided: false,
    });

  it("scores a grounded, specific, policy-compliant answer at the top", () => {
    const { scores, notes } = score(metaOutput("Monthly bookkeeping for Leeds small businesses from £149 a month."));
    expect(scores).toMatchObject({ grounding: 1, hallucination: 1, specificity: 1, constraints: 1, factual: 1, usefulness: 1 });
    expect(notes).toEqual({});
  });

  it("flags an invented number", () => {
    const { scores, notes } = score(metaOutput("Bookkeeping for 500 Leeds businesses from £149 a month."));
    expect(scores.hallucination).toBeLessThan(1);
    expect(notes.hallucination?.[0]).toContain("500");
  });

  it("flags a character-count rule the knowledge corpus refutes", () => {
    const { scores, notes } = score(metaOutput("Bookkeeping in Leeds.", "Kept to 150-160 characters for Google."));
    expect(scores.constraints).toBeLessThan(1);
    expect(notes.constraints).toContain("cites a character range");
  });

  it("flags generic copy and a wrong diagnosis", () => {
    const output = { ...metaOutput("Welcome to our website."), diagnosis: "The description is fine." };
    const { scores } = score(output);
    expect(scores.specificity).toBe(0);
    expect(scores.factual).toBeLessThan(1);
  });

  it("accepts a short field name cited exactly", () => {
    const { scores } = scoreOutput({
      feature: "meta",
      output: { ...metaOutput("Bookkeeping in Leeds from £149 a month."), groundedIn: ["h1", "evidence.contentExcerpt"] },
      evidence: { h1: "Bookkeeping", contentExcerpt: source },
      sourceText: source,
      knowledgeIds: [],
      expect: expectMeta,
      businessProvided: false,
    });
    expect(scores.grounding).toBe(1);
  });

  it("flags citations of evidence the prompt never contained", () => {
    const { scores } = score({ ...metaOutput("Bookkeeping in Leeds"), groundedIn: ["customerReviews"] });
    expect(scores.grounding).toBe(0);
  });
});

/** A provider that answers every case with a well-formed, grounded output. */
function fakeProvider(): AiProvider {
  const outputs: Record<string, unknown> = {
    meta: metaOutput("Monthly bookkeeping for Leeds small businesses from £149 a month."),
    "competitor-insight": {
      summary: "The competitor has a pricing page and FAQ markup that this site lacks.",
      strengths: [{ factId: "pt:pricing", interpretation: "A pricing page may answer cost questions before a visitor asks." }],
      weaknesses: [],
      gaps: [
        {
          factId: "pt:pricing",
          kind: "page-type",
          interpretation: "Visitors comparing providers may look for prices.",
          recommendation: "Decide whether publishing prices fits how you sell.",
          worthPursuing: "yes",
          reason: "Common in the sector.",
        },
      ],
      groundedIn: ["pt:pricing"],
      confidence: "medium",
      needsHumanReview: true,
    },
  };
  return {
    name: "fake",
    async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
      const output = outputs[request.feature];
      if (!output) throw new Error(`no canned output for ${request.feature}`);
      return {
        data: request.schema.parse(output),
        raw: JSON.stringify(output),
        model: request.model,
        provider: "fake",
        usage: { input: 1000, output: 200 },
        latencyMs: 5,
        attempts: 1,
      };
    },
  };
}

describe("runBenchmark", () => {
  const cases = BENCHMARK_CASES.filter((item) => ["meta-missing-service", "image-no-evidence", "competitor-quick"].includes(item.id));

  it("covers every case type the plan lists", () => {
    const covered = new Set(BENCHMARK_CASES.flatMap((item) => item.covers));
    for (const topic of [
      "missing meta",
      "good meta",
      "service page",
      "product page",
      "article",
      "schema",
      "thin content",
      "ambiguous page",
      "image evidence",
      "image no evidence",
    ]) {
      expect(covered).toContain(topic);
    }
  });

  it("runs cases through the real specs and scores them", async () => {
    const [report] = await runBenchmark({ variants: [{ label: "fake", model: "fake-model", provider: fakeProvider() }], cases });
    const byId = Object.fromEntries(report.cases.map((row) => [row.caseId, row]));

    expect(byId["meta-missing-service"].scores.structuredValidity).toBe(1);
    expect(byId["meta-missing-service"].overall).toBe(1);
    // Routing is checked without a model call.
    expect(byId["image-no-evidence"].scores.factual).toBe(1);
    expect(byId["image-no-evidence"].tokens.input).toBeNull();
    // The refinement turned the model's "yes" into "maybe" before scoring.
    expect(byId["competitor-quick"].scores.factual).toBe(1);
    expect(report.tokens).toEqual({ input: 2000, output: 400 });
    expect(formatReport(report)).toContain("TOTAL");
  });

  it("records a provider failure as an invalid result rather than throwing", async () => {
    const broken: AiProvider = {
      name: "broken",
      async generateStructured() {
        throw new Error("boom");
      },
    };
    const [report] = await runBenchmark({
      variants: [{ label: "broken", model: "m", provider: broken }],
      cases: cases.slice(0, 1),
      generateOptions: { maxRetries: 0, sleep: async () => {} },
    });
    expect(report.cases[0].scores.structuredValidity).toBe(0);
    expect(report.cases[0].error).toContain("boom");
  });

  it("compares two variants on the same cases", async () => {
    const [good] = await runBenchmark({ variants: [{ label: "good", model: "m", provider: fakeProvider() }], cases: cases.slice(0, 1) });
    const bad: AiProvider = {
      name: "bad",
      async generateStructured<T>(request: StructuredRequest<T>) {
        const output = metaOutput("Welcome to our website, aim for 150-160 characters.");
        return { data: request.schema.parse(output), raw: "", model: "m2", provider: "bad", usage: { input: 1, output: 1 }, latencyMs: 1, attempts: 1 };
      },
    };
    const [worse] = await runBenchmark({ variants: [{ label: "bad", model: "m2", provider: bad }], cases: cases.slice(0, 1) });
    const comparison = compareReports(good, worse);
    expect(comparison.overall.delta!).toBeLessThan(0);
    expect(comparison.regressions.map((row) => row.caseId)).toEqual(["meta-missing-service"]);
  });
});
