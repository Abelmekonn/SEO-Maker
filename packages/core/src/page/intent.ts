/**
 * Deterministic search-intent inference (Phase 2.5).
 *
 * Intent is what a searcher who lands on this page most plausibly wanted. It
 * is inferred from the page's own signals: its type and the wording of its
 * title and H1. No query data is involved, so every answer is a heuristic and
 * carries a confidence, and when the signals are weak the answer is null
 * rather than a guess.
 *
 * The knowledge corpus asks for intent classifications to be presented as
 * inferences with stated reasoning; `evidence` is that reasoning.
 */

import type { PageType } from "./classify";

export type SearchIntent = "informational" | "navigational" | "commercial" | "transactional";

export type IntentInput = {
  pageType?: PageType | string | null;
  title?: string | null;
  h1?: string | null;
};

export type IntentInference = {
  intent: SearchIntent | null;
  /** 0-1. Below 0.5 the UI should present the intent as uncertain. */
  confidence: number;
  evidence: string[];
};

/** Wording that states intent outright. Checked before the page type. */
const WORDING: Array<{ intent: SearchIntent; pattern: RegExp; label: string }> = [
  {
    intent: "transactional",
    pattern: /\b(buy|order|checkout|add to cart|subscribe|sign ?up|get started|start (your )?free|free trial|book (a )?demo|download)\b/i,
    label: "asks the visitor to act (buy, sign up, start)",
  },
  {
    intent: "commercial",
    pattern: /\b(best|top \d+|vs\.?|versus|compare|comparison|alternatives?|reviews?|pricing|prices?|plans)\b/i,
    label: "compares or prices options",
  },
  {
    intent: "informational",
    pattern: /\b(how to|what is|what are|why|guide|tutorial|learn|explained|introduction to|tips|examples?)\b/i,
    label: "explains or teaches",
  },
  {
    intent: "navigational",
    pattern: /\b(log ?in|sign ?in|contact( us)?|about( us)?|careers|support)\b/i,
    label: "helps a visitor reach a known place",
  },
];

/** What a page of each type is usually for, and how sure that makes us. */
const BY_TYPE: Partial<Record<PageType, { intent: SearchIntent; confidence: number }>> = {
  homepage: { intent: "navigational", confidence: 0.6 },
  about: { intent: "navigational", confidence: 0.7 },
  contact: { intent: "navigational", confidence: 0.75 },
  legal: { intent: "navigational", confidence: 0.6 },
  pricing: { intent: "commercial", confidence: 0.75 },
  product: { intent: "commercial", confidence: 0.65 },
  service: { intent: "commercial", confidence: 0.65 },
  landing: { intent: "transactional", confidence: 0.7 },
  article: { intent: "informational", confidence: 0.75 },
  documentation: { intent: "informational", confidence: 0.8 },
  category: { intent: "commercial", confidence: 0.45 },
};

export function inferSearchIntent(input: IntentInput): IntentInference {
  const text = `${input.title ?? ""} ${input.h1 ?? ""}`.trim();
  const type = (input.pageType ?? null) as PageType | null;
  const byType = type ? BY_TYPE[type] : undefined;

  const worded = text ? WORDING.find((rule) => rule.pattern.test(text)) : undefined;

  if (worded && byType) {
    if (worded.intent === byType.intent) {
      return {
        intent: worded.intent,
        confidence: Math.min(0.9, byType.confidence + 0.15),
        evidence: [`Page type is ${type}`, `Title or H1 ${worded.label}`],
      };
    }
    // The wording and the type disagree. Wording is the more specific signal,
    // but the disagreement is itself information, so confidence drops.
    return {
      intent: worded.intent,
      confidence: 0.55,
      evidence: [
        `Title or H1 ${worded.label}`,
        `Page type ${type} usually suggests ${byType.intent}, so this is uncertain`,
      ],
    };
  }

  if (worded) {
    return { intent: worded.intent, confidence: 0.6, evidence: [`Title or H1 ${worded.label}`] };
  }

  if (byType) {
    return { intent: byType.intent, confidence: byType.confidence, evidence: [`Page type is ${type}`] };
  }

  return { intent: null, confidence: 0, evidence: ["No decisive signal in the page type or wording"] };
}
