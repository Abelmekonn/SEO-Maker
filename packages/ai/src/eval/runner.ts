/**
 * Benchmark runner and comparison (Phase 4.3, 4.4).
 *
 * Runs the fixed cases through the real feature specs (so the production
 * prompts, grounding refinements and contracts are what is measured) against
 * one or more model variants, then compares reports. Changing a model, a
 * prompt or the knowledge corpus is then a before/after on identical inputs:
 *
 *   Groq model A  vs  Groq model B  vs  a future premium model
 *
 * without touching any feature code. Nothing here writes to the database or
 * the AI cache: a benchmark must never serve, or be served, a production answer.
 */

import { planFixes } from "@seo-maker/core/page";
import { type AiFeature, type ProviderId, estimateCost, loadAiConfig, promptVersionFor } from "../config";
import { buildKnowledgeContext } from "../context";
import { competitorInsightSpec } from "../features/competitor";
import { type BusinessBlock, type PageFeatureSpec, pageFeatureSpec } from "../features/page";
import { SITE_PROMPT_OPPORTUNITIES, siteOpportunitySpec } from "../features/site";
import type { KnowledgeBundle, KnowledgeQuery } from "../knowledge";
import { AiError, type AiProvider, type GenerateOptions, generateStructured, getAiProvider } from "../provider";
import { BENCHMARK_CASES, type BenchmarkCase, knownSiteContext } from "./cases";
import { METRICS, type Metric, type ScoreNotes, type Scores, emptyScores, overall, scoreOutput } from "./scorers";

export type BenchmarkVariant = {
  /** Shown in reports, e.g. "gpt-oss-120b" or "120b, prompt v3". */
  label: string;
  model: string;
  /** Which configured provider runs the model. Defaults to AI_PROVIDER_DEFAULT. */
  providerId?: ProviderId;
  /** Injected in tests. The configured provider otherwise. */
  provider?: AiProvider;
  temperature?: number;
};

export type CaseResult = {
  caseId: string;
  feature: string;
  covers: string[];
  scores: Scores;
  overall: number | null;
  notes: ScoreNotes;
  tokens: { input: number | null; output: number | null };
  latencyMs: number | null;
  error: string | null;
  /** The output as scored, for reading next to the scores. */
  output: unknown;
};

export type BenchmarkReport = {
  label: string;
  model: string;
  promptVersions: Record<string, string>;
  knowledgeVersion: string | null;
  startedAt: string;
  finishedAt: string;
  cases: CaseResult[];
  aggregate: Scores;
  overall: number | null;
  tokens: { input: number; output: number };
  estimatedCost: number | null;
};

export type RunBenchmarkOptions = {
  variants: BenchmarkVariant[];
  cases?: BenchmarkCase[];
  /**
   * Knowledge retrieval. Omit to measure the prompts with no grounding at all;
   * the CLI passes the database retriever so the corpus version is measured too.
   */
  knowledge?: (query: KnowledgeQuery) => Promise<KnowledgeBundle>;
  generateOptions?: Omit<GenerateOptions, "provider">;
  onCase?: (variant: BenchmarkVariant, result: CaseResult) => void;
};

const EMPTY_BUNDLE: KnowledgeBundle = { items: [], contradictions: [], policies: [], knowledgeVersion: null };

type Built = {
  spec: PageFeatureSpec<unknown>;
  allowedIds: string[];
  business: BusinessBlock;
};

function buildSpec(benchmarkCase: Exclude<BenchmarkCase, { kind: "routing" }>): Built {
  switch (benchmarkCase.kind) {
    case "page":
      return {
        spec: pageFeatureSpec(benchmarkCase.feature, benchmarkCase.context, benchmarkCase.site ?? knownSiteContext(), benchmarkCase.business),
        allowedIds: [],
        business: benchmarkCase.business,
      };
    case "site": {
      const { intel, candidates } = benchmarkCase.build();
      return {
        spec: siteOpportunitySpec(intel, candidates, benchmarkCase.business) as PageFeatureSpec<unknown>,
        allowedIds: candidates.slice(0, SITE_PROMPT_OPPORTUNITIES).map((candidate) => candidate.key),
        business: benchmarkCase.business,
      };
    }
    case "competitor": {
      const { intel, comparison } = benchmarkCase.build();
      return {
        spec: competitorInsightSpec(comparison, intel, benchmarkCase.business) as PageFeatureSpec<unknown>,
        allowedIds: comparison.facts.map((fact) => fact.id),
        business: benchmarkCase.business,
      };
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof AiError) {
    return `${error.kind}: ${error.message}${error.detail ? ` (${error.detail.slice(0, 200)})` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function caseFeature(benchmarkCase: BenchmarkCase): string {
  if (benchmarkCase.kind === "page") return benchmarkCase.feature;
  if (benchmarkCase.kind === "site") return "site-opportunity";
  if (benchmarkCase.kind === "competitor") return "competitor-insight";
  return "fix-plan";
}

async function runCase(
  variant: BenchmarkVariant,
  benchmarkCase: BenchmarkCase,
  options: RunBenchmarkOptions,
): Promise<{ result: CaseResult; knowledgeVersion: string | null }> {
  const base = {
    caseId: benchmarkCase.id,
    feature: caseFeature(benchmarkCase),
    covers: benchmarkCase.covers,
  };

  // Routing is decided by code before any model call. The check is that the
  // plan withholds generation where the evidence cannot support it.
  if (benchmarkCase.kind === "routing") {
    const expected = benchmarkCase.expect.strategy!;
    const fix = planFixes(benchmarkCase.plan).find((row) => row.checkId === expected.checkId);
    const ok = fix?.strategy === expected.is;
    const scores = { ...emptyScores(), factual: ok ? 1 : 0 };
    return {
      result: {
        ...base,
        scores,
        overall: overall(scores),
        notes: ok ? {} : { factual: [`routed to ${fix?.strategy ?? "nothing"}, expected ${expected.is}`] },
        tokens: { input: null, output: null },
        latencyMs: 0,
        error: null,
        output: fix ?? null,
      },
      knowledgeVersion: null,
    };
  }

  const built = buildSpec(benchmarkCase);
  const bundle = options.knowledge ? await options.knowledge(built.spec.knowledge) : EMPTY_BUNDLE;
  const prompt = built.spec.buildPrompt(buildKnowledgeContext(bundle), { imagesAttached: false });

  const failed = (error: string, output: unknown = null, tokens = { input: null, output: null } as CaseResult["tokens"]) => {
    const scores = { ...emptyScores(), structuredValidity: 0 };
    return {
      result: { ...base, scores, overall: 0, notes: { structuredValidity: [error] }, tokens, latencyMs: null, error, output },
      knowledgeVersion: bundle.knowledgeVersion,
    };
  };

  try {
    const response = await generateStructured(
      {
        feature: built.spec.feature,
        mode: built.business ? "deep" : "quick",
        schema: built.spec.schema,
        schemaName: built.spec.feature,
        system: prompt.system,
        user: prompt.user,
        model: variant.model,
        maxTokens: built.spec.maxTokens,
        temperature: variant.temperature ?? built.spec.temperature,
      },
      {
        ...options.generateOptions,
        provider: variant.provider ?? getAiProvider(variant.providerId ?? loadAiConfig().defaultProvider),
      },
    );
    const tokens = { input: response.usage.input, output: response.usage.output };
    const refined = built.spec.refine ? built.spec.refine(response.data, { imagesSent: false }) : { ok: true as const, data: response.data };
    if (!refined.ok) return failed(`failed a grounding check: ${refined.reason}`, response.data, tokens);

    const { scores, notes } = scoreOutput({
      feature: built.spec.feature,
      output: refined.data as Record<string, unknown>,
      evidence: built.spec.evidence,
      sourceText: prompt.user,
      knowledgeIds: bundle.items.map((item) => item.id),
      allowedIds: built.allowedIds,
      expect: benchmarkCase.expect,
      businessProvided: Boolean(built.business),
    });
    return {
      result: {
        ...base,
        scores,
        overall: overall(scores),
        notes,
        tokens,
        latencyMs: response.latencyMs,
        error: null,
        output: refined.data,
      },
      knowledgeVersion: bundle.knowledgeVersion,
    };
  } catch (error) {
    return failed(describeError(error));
  }
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

export async function runBenchmark(options: RunBenchmarkOptions): Promise<BenchmarkReport[]> {
  const cases = options.cases ?? BENCHMARK_CASES;
  const features = [...new Set(cases.map(caseFeature).filter((feature) => feature !== "fix-plan"))] as AiFeature[];
  const reports: BenchmarkReport[] = [];

  for (const variant of options.variants) {
    const startedAt = new Date().toISOString();
    const results: CaseResult[] = [];
    let knowledgeVersion: string | null = null;
    for (const benchmarkCase of cases) {
      const { result, knowledgeVersion: version } = await runCase(variant, benchmarkCase, options);
      knowledgeVersion ??= version;
      results.push(result);
      options.onCase?.(variant, result);
    }

    const aggregate = Object.fromEntries(
      METRICS.map((metric) => [metric, mean(results.map((result) => result.scores[metric]))]),
    ) as Scores;
    const tokens = results.reduce(
      (sum, result) => ({ input: sum.input + (result.tokens.input ?? 0), output: sum.output + (result.tokens.output ?? 0) }),
      { input: 0, output: 0 },
    );
    reports.push({
      label: variant.label,
      model: variant.model,
      promptVersions: Object.fromEntries(features.map((feature) => [feature, promptVersionFor(feature)])),
      knowledgeVersion,
      startedAt,
      finishedAt: new Date().toISOString(),
      cases: results,
      aggregate,
      overall: mean(results.map((result) => result.overall)),
      tokens,
      estimatedCost: estimateCost(variant.model, tokens.input, tokens.output),
    });
  }
  return reports;
}

// ------------------------------------------------------------------ comparison

export type ReportComparison = {
  base: string;
  candidate: string;
  metrics: Array<{ metric: Metric; base: number | null; candidate: number | null; delta: number | null }>;
  overall: { base: number | null; candidate: number | null; delta: number | null };
  /** Cases whose overall score moved by at least `threshold`. */
  regressions: Array<{ caseId: string; base: number | null; candidate: number | null }>;
  improvements: Array<{ caseId: string; base: number | null; candidate: number | null }>;
  cost: { base: number | null; candidate: number | null };
};

const delta = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.round((b - a) * 1000) / 1000);

export function compareReports(base: BenchmarkReport, candidate: BenchmarkReport, threshold = 0.1): ReportComparison {
  const byCase = new Map(base.cases.map((result) => [result.caseId, result]));
  const moved = candidate.cases.flatMap((result) => {
    const before = byCase.get(result.caseId);
    const change = delta(before?.overall ?? null, result.overall);
    return change == null || Math.abs(change) < threshold
      ? []
      : [{ caseId: result.caseId, base: before?.overall ?? null, candidate: result.overall, change }];
  });
  return {
    base: base.label,
    candidate: candidate.label,
    metrics: METRICS.map((metric) => ({
      metric,
      base: base.aggregate[metric],
      candidate: candidate.aggregate[metric],
      delta: delta(base.aggregate[metric], candidate.aggregate[metric]),
    })),
    overall: { base: base.overall, candidate: candidate.overall, delta: delta(base.overall, candidate.overall) },
    regressions: moved.filter((row) => row.change < 0).map(({ change: _change, ...row }) => row),
    improvements: moved.filter((row) => row.change > 0).map(({ change: _change, ...row }) => row),
    cost: { base: base.estimatedCost, candidate: candidate.estimatedCost },
  };
}

const pct = (value: number | null) => (value == null ? "  -  " : `${Math.round(value * 100)}%`.padStart(5));

/** A plain-text table for the terminal. */
export function formatReport(report: BenchmarkReport): string {
  const header = ["case".padEnd(26), ...METRICS.map((metric) => metric.slice(0, 5).padStart(5)), "  all"].join(" ");
  const rows = report.cases.map((result) =>
    [result.caseId.padEnd(26).slice(0, 26), ...METRICS.map((metric) => pct(result.scores[metric])), pct(result.overall)].join(" ") +
    (result.error ? `  ! ${result.error.slice(0, 80)}` : ""),
  );
  const total = ["TOTAL".padEnd(26), ...METRICS.map((metric) => pct(report.aggregate[metric])), pct(report.overall)].join(" ");
  return [
    `${report.label} (${report.model}) · knowledge ${report.knowledgeVersion ?? "none"} · ${report.tokens.input + report.tokens.output} tokens` +
      (report.estimatedCost != null ? ` · $${report.estimatedCost.toFixed(4)}` : ""),
    header,
    ...rows,
    total,
  ].join("\n");
}

export function formatComparison(comparison: ReportComparison): string {
  const lines = [
    `${comparison.candidate} vs ${comparison.base}`,
    ...comparison.metrics.map(
      (row) => `  ${row.metric.padEnd(20)} ${pct(row.base)} -> ${pct(row.candidate)}${row.delta ? `  (${row.delta > 0 ? "+" : ""}${Math.round(row.delta * 100)})` : ""}`,
    ),
    `  ${"overall".padEnd(20)} ${pct(comparison.overall.base)} -> ${pct(comparison.overall.candidate)}`,
  ];
  if (comparison.regressions.length) lines.push(`  regressions: ${comparison.regressions.map((row) => row.caseId).join(", ")}`);
  if (comparison.improvements.length) lines.push(`  improvements: ${comparison.improvements.map((row) => row.caseId).join(", ")}`);
  return lines.join("\n");
}
