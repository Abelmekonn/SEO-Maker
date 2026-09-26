/**
 * Benchmark scorers (Phase 4.3).
 *
 * Deterministic checks of one model output against one case. Each returns a
 * 0..1 score, or null when the measure does not apply to the case, plus the
 * reasons for any point lost, so a regression names what went wrong.
 *
 * These are proxies. A model can pass every check and still write something
 * unhelpful; they exist to catch the failures that matter most for this
 * product (invented facts, policy violations, generic filler) automatically
 * and identically across runs, not to replace reading the output.
 */

import { ungroundedNumbers } from "../features/grounding";
import type { Expectations } from "./cases";

export type Metric =
  | "structuredValidity"
  | "grounding"
  | "hallucination"
  | "specificity"
  | "constraints"
  | "factual"
  | "usefulness";

export const METRICS: Metric[] = [
  "structuredValidity",
  "grounding",
  "hallucination",
  "specificity",
  "constraints",
  "factual",
  "usefulness",
];

export type Scores = Record<Metric, number | null>;
export type ScoreNotes = Partial<Record<Metric, string[]>>;

/** Phrasings the knowledge corpus policies forbid in every output. */
export const POLICY_VIOLATIONS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\b\d+\s*(?:-|–|to)\s*\d+\s*char(?:acter)?s?\b/i, why: "cites a character range" },
  { pattern: /\bunder\s+\d+\s*char(?:acter)?s?\b|\bcharacter (?:limit|count)\b/i, why: "cites a character limit" },
  { pattern: /\b(?:at least|minimum of|aim for)\s+\d{2,5}\s*words\b/i, why: "sets a word-count target" },
  { pattern: /\bguarantee[sd]?\b|\brank(?:s|ing)? #?1\b|\btop of google\b|\bwill rank\b/i, why: "promises rankings" },
  { pattern: /\bwill (?:get|show|display|earn) (?:a |the )?rich (?:results?|snippets?)\b/i, why: "promises rich results" },
];

/** Generic filler that says nothing about the page in front of it. */
const FILLER = /\b(improve your seo|optimi[sz]e your (?:content|website|site)|follow (?:seo )?best practices|boost your rankings)\b/i;

/** Every string in the output except the model's own citation list. */
export function textOf(value: unknown, skip = new Set(["groundedIn"])): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => textOf(item, skip)).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !skip.has(key))
      .map(([, item]) => textOf(item, skip))
      .join("\n");
  }
  return typeof value === "number" ? String(value) : "";
}

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, into);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      into.add(key.toLowerCase());
      keysOf(item, into);
    }
  }
  return into;
}

const urlsIn = (text: string) => new Set(text.match(/https?:\/\/[^\s"'<>),]+/g) ?? []);

type Output = Record<string, unknown>;

/** The suggestion strings a reader would act on, per feature. */
export function primaryTexts(feature: string, output: Output): string[] {
  const list = (key: string) => (Array.isArray(output[key]) ? (output[key] as Output[]) : []);
  switch (feature) {
    case "title":
    case "meta":
    case "heading":
      return list("suggestions").map((row) => String(row.value ?? ""));
    case "content":
      return [...list("missingTopics").map((row) => `${row.topic} ${row.why}`), ...list("outline").map((row) => String(row.heading))];
    case "image-alt":
      return list("images").map((row) => String(row.alt ?? ""));
    case "schema":
      return [JSON.stringify(output.jsonLd ?? {})];
    case "site-opportunity":
      return list("opportunities").map((row) => `${row.title} ${row.action}`);
    case "competitor-insight":
      return [...list("strengths"), ...list("weaknesses"), ...list("gaps")].map((row) => String(row.interpretation ?? ""));
    default:
      return [textOf(output)];
  }
}

/** Longer explanation fields, for the usefulness proxy. */
function explanationTexts(feature: string, output: Output): string[] {
  const list = (key: string) => (Array.isArray(output[key]) ? (output[key] as Output[]) : []);
  switch (feature) {
    case "title":
    case "meta":
    case "heading":
      return list("suggestions").map((row) => String(row.reasoning ?? ""));
    case "content":
      return list("missingTopics").map((row) => String(row.why ?? ""));
    case "site-opportunity":
      return list("opportunities").map((row) => `${row.rationale} ${row.nextStep}`);
    case "competitor-insight":
      return list("gaps").map((row) => `${row.recommendation}`);
    case "schema":
      return [String(output.entityReasoning ?? "")];
    default:
      return [];
  }
}

export type ScoreInput = {
  feature: string;
  output: Output;
  /** The evidence object the prompt contained; its field names are citable. */
  evidence: unknown;
  /** Everything the prompt said (evidence, business context, knowledge). A
   *  number or URL in the output that is not in here was invented. */
  sourceText: string;
  /** Knowledge ids retrieved for the prompt, which the model may cite. */
  knowledgeIds: string[];
  /** Ids the model was allowed to reference (opportunity ids, fact ids). */
  allowedIds?: string[];
  /** The page's own current value, for `current` checks. */
  expect: Expectations;
  businessProvided: boolean;
};

export function scoreOutput(input: ScoreInput): { scores: Scores; notes: ScoreNotes } {
  const notes: ScoreNotes = {};
  const note = (metric: Metric, message: string) => {
    (notes[metric] ??= []).push(message);
  };
  const { output, expect, feature } = input;
  const sourceText = input.sourceText;
  const allText = textOf(output);
  const primary = primaryTexts(feature, output);

  // ---- grounding: what the model says it used must be something it was given
  const cited = Array.isArray(output.groundedIn) ? (output.groundedIn as string[]) : [];
  const known = new Set([...keysOf(input.evidence), ...input.knowledgeIds.map((id) => id.toLowerCase()), ...(input.allowedIds ?? []).map((id) => id.toLowerCase())]);
  const recognised = cited.filter((entry) => {
    const lower = entry.toLowerCase().trim();
    // Exact names of any length ("h1"); longer names also inside a path
    // ("evidence.contentExcerpt"), where a two-letter key would match anything.
    return known.has(lower) || [...known].some((key) => key.length >= 3 && lower.includes(key));
  });
  cited.filter((entry) => !recognised.includes(entry)).forEach((entry) => note("grounding", `cites unknown "${entry}"`));
  const grounding = cited.length ? recognised.length / cited.length : 0;
  if (!cited.length) note("grounding", "cites nothing");

  // ---- hallucination: numbers and URLs the evidence does not contain
  const numbers = ungroundedNumbers(allText, sourceText);
  const sourceUrls = urlsIn(sourceText);
  const urls = [...urlsIn(allText)].filter((url) => !sourceUrls.has(url) && !/schema\.org/i.test(url));
  numbers.forEach((number) => note("hallucination", `number ${number} is not in the evidence`));
  urls.forEach((url) => note("hallucination", `URL ${url} is not in the evidence`));
  const hallucination = Math.max(0, 1 - 0.25 * (numbers.length + urls.length));

  // ---- specificity: suggestions name what this page or site is actually about
  let specificity: number | null = null;
  if (expect.specificTerms?.length && primary.length) {
    const hits = primary.filter((text) => expect.specificTerms!.some((term) => text.toLowerCase().includes(term.toLowerCase())));
    specificity = hits.length / primary.length;
    if (specificity < 1) note("specificity", `${primary.length - hits.length} of ${primary.length} suggestions name none of: ${expect.specificTerms.join(", ")}`);
  }

  // ---- constraints: corpus policies, case prohibitions, feature rules
  const constraintChecks: Array<[boolean, string]> = [
    ...POLICY_VIOLATIONS.map(({ pattern, why }) => [!pattern.test(allText), why] as [boolean, string]),
    ...(expect.forbidden ?? []).map((pattern) => [!pattern.test(JSON.stringify(output)), `matches ${pattern}`] as [boolean, string]),
  ];
  if (feature === "title" || feature === "meta" || feature === "heading") {
    const values = primary.map((value) => value.trim().toLowerCase());
    constraintChecks.push([new Set(values).size === values.length, "suggestions repeat each other"]);
  }
  if (feature === "image-alt") {
    constraintChecks.push([primary.every((alt) => !/^(image|picture|photo) of\b/i.test(alt)), 'alt text starts with "image of"']);
  }
  if (feature === "schema") {
    const context = String((output.jsonLd as Output | undefined)?.["@context"] ?? "");
    constraintChecks.push([/schema\.org/i.test(context), "JSON-LD lacks a schema.org @context"]);
  }
  constraintChecks.filter(([ok]) => !ok).forEach(([, why]) => note("constraints", why));
  const constraints = constraintChecks.filter(([ok]) => ok).length / constraintChecks.length;

  // ---- factual: statements about the current page match the evidence
  const facts: Array<[boolean, string]> = [];
  if ("current" in expect) facts.push([output.current === expect.current, `current is "${output.current}", page has "${expect.current}"`]);
  if (expect.diagnosisMissing !== undefined) {
    const saysMissing = /\b(no|missing|absent|lacks|without)\b/i.test(String(output.diagnosis ?? ""));
    facts.push([saysMissing === expect.diagnosisMissing, expect.diagnosisMissing ? "diagnosis does not report it missing" : "diagnosis wrongly reports it missing"]);
  }
  if (expect.entityType) {
    const types = ([] as unknown[]).concat((output.jsonLd as Output | undefined)?.["@type"] ?? []).map(String);
    facts.push([types.some((type) => expect.entityType!.test(type)), `@type ${types.join(", ") || "(none)"} does not match ${expect.entityType}`]);
  }
  if (expect.notConfident) {
    facts.push([output.confidence !== "high" || output.needsHumanReview === true, "claims high confidence on thin evidence"]);
  }
  if (expect.needsHumanReview) facts.push([output.needsHumanReview === true, "does not ask for human review"]);
  const images = Array.isArray(output.images) ? output.images.length : 0;
  if (expect.minImages !== undefined) facts.push([images >= expect.minImages, `kept ${images} image suggestions, expected at least ${expect.minImages}`]);
  if (expect.maxImages !== undefined) facts.push([images <= expect.maxImages, `kept ${images} image suggestions, expected at most ${expect.maxImages}`]);
  if (expect.minMissingTopics !== undefined) {
    const topics = Array.isArray(output.missingTopics) ? output.missingTopics.length : 0;
    facts.push([topics >= expect.minMissingTopics, `${topics} missing topics, expected at least ${expect.minMissingTopics}`]);
  }
  if (expect.noYesWithoutBusiness && !input.businessProvided) {
    const gaps = Array.isArray(output.gaps) ? (output.gaps as Output[]) : [];
    facts.push([gaps.every((gap) => gap.worthPursuing !== "yes"), 'calls a gap worth pursuing with no business context']);
  }
  facts.filter(([ok]) => !ok).forEach(([, why]) => note("factual", why));
  const factual = facts.length ? facts.filter(([ok]) => ok).length / facts.length : null;

  // ---- usefulness: something to act on, explained, and not filler
  const explanations = explanationTexts(feature, output);
  const useful: Array<[boolean, string]> = [
    [primary.some((text) => text.trim().length > 0), "no suggestion to act on"],
    [!FILLER.test(allText), "contains generic filler"],
  ];
  if (explanations.length) {
    const average = explanations.reduce((sum, text) => sum + text.trim().length, 0) / explanations.length;
    useful.push([average >= 40, "explanations are too short to act on"]);
  }
  useful.filter(([ok]) => !ok).forEach(([, why]) => note("usefulness", why));
  const usefulness = useful.filter(([ok]) => ok).length / useful.length;

  return {
    scores: { structuredValidity: 1, grounding, hallucination, specificity, constraints, factual, usefulness },
    notes,
  };
}

export function emptyScores(): Scores {
  return Object.fromEntries(METRICS.map((metric) => [metric, null])) as Scores;
}

/** Mean of the metrics that applied. */
export function overall(scores: Scores): number | null {
  const values = Object.values(scores).filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
