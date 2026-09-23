/**
 * Token budgeting for the site-level evidence package.
 *
 * Two rules here exist because of how models fail, not to save money:
 *
 *  1. The knowledge block is measured and subtracted BEFORE pages are packed.
 *     Grounding that gets squeezed out by page text is worse than fewer pages:
 *     an ungrounded model repeats the myths the corpus exists to block.
 *
 *  2. On overflow we drop whole pages from the bottom of the importance
 *     ranking. We never truncate a page mid-field. A half-serialized evidence
 *     object is exactly what makes a model invent the missing half.
 */

import { leadParagraph, sectionSpans } from "./sections";
import type { HeadingEvidence, SchemaEvidence } from "../page/intelligence";

/**
 * Rough character-per-token ratio for English prose with markup noise.
 *
 * Always called an estimate and never shown as a cost: we do not have the
 * provider's tokenizer, and presenting a guess as a bill would be dishonest.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.7);
}

export const SITE_TOKEN_BUDGET = { quick: 28_000, deep: 60_000 } as const;

/** Per-page floor and ceiling, so one huge page cannot crowd out the rest. */
export const PAGE_TOKEN_FLOOR = 250;
export const PAGE_TOKEN_CEILING = 1_400;

export type PackablePage = {
  id: string;
  url: string;
  pageType: string | null;
  title: string | null;
  h1: string | null;
  metaDesc: string | null;
  content: string | null;
  headings: HeadingEvidence[];
  schema: SchemaEvidence[];
  /** 0-100 from `pageImportance`. Drives the share of the budget. */
  importance: number;
};

export type PackedPage = {
  id: string;
  url: string;
  /** The serialized evidence block handed to the prompt. */
  text: string;
  tokens: number;
};

export type PackResult = {
  packed: PackedPage[];
  /** Pages dropped for budget, with why — surfaced, never silently lost. */
  deferred: Array<{ id: string; url: string; importance: number; reason: string }>;
  tokensUsed: number;
  tokensAvailable: number;
};

/**
 * Splits the remaining budget across pages in proportion to importance,
 * clamped to the floor/ceiling.
 */
export function allocateBudget(pages: PackablePage[], available: number): Map<string, number> {
  const allocation = new Map<string, number>();
  const totalImportance = pages.reduce((sum, page) => sum + Math.max(1, page.importance), 0);
  if (totalImportance <= 0) return allocation;

  for (const page of pages) {
    const share = (Math.max(1, page.importance) / totalImportance) * available;
    const clamped = Math.min(PAGE_TOKEN_CEILING, Math.max(PAGE_TOKEN_FLOOR, Math.floor(share)));
    allocation.set(page.id, clamped);
  }
  return allocation;
}

/**
 * Serializes one page, spending its allocation in a fixed priority order.
 *
 * The order matters: identity first (url, type, title, h1), then the
 * description, then structure, then prose. If the budget runs out it runs out
 * at the least important end, and every field that made it is complete.
 */
export function packPage(page: PackablePage, tokenBudget: number): string {
  const lines: string[] = [];
  let spent = 0;

  const push = (line: string): boolean => {
    const cost = estimateTokens(line);
    if (spent + cost > tokenBudget) return false;
    lines.push(line);
    spent += cost;
    return true;
  };

  push(`URL: ${page.url}`);
  if (page.pageType) push(`Type: ${page.pageType}`);
  if (page.title) push(`Title: ${page.title}`);
  if (page.h1) push(`H1: ${page.h1}`);
  if (page.metaDesc) push(`Meta description: ${page.metaDesc}`);

  const schemaTypes = [...new Set(page.schema.flatMap((block) => block.types))];
  if (schemaTypes.length > 0) push(`Schema types: ${schemaTypes.join(", ")}`);

  const headings = page.headings.slice(0, 12).map((heading) => heading.text).filter(Boolean);
  if (headings.length > 0) push(`Headings: ${headings.join(" | ")}`);

  const lead = leadParagraph(page.content, 600);
  if (lead) push(`Lead: ${lead}`);

  // Later sections get a short opening each: enough to tell what the section
  // covers, not enough to let one long page dominate the package.
  for (const section of sectionSpans(page.content, page.headings)) {
    if (!section.heading || !section.text) continue;
    if (!push(`Section "${section.heading}": ${section.text.slice(0, 200)}`)) break;
  }

  return lines.join("\n");
}

/** Whether the page carries anything a model could read beyond its address. */
function hasSubstance(page: PackablePage): boolean {
  return Boolean(
    page.content?.trim() ||
      page.title?.trim() ||
      page.h1?.trim() ||
      page.metaDesc?.trim() ||
      page.headings.length > 0,
  );
}

/**
 * Packs the selected pages into the budget left after grounding.
 *
 * `knowledgeTokens` is subtracted up front — see rule 1 at the top of this file.
 */
export function packPageEvidence(input: {
  pages: PackablePage[];
  mode: "quick" | "deep";
  knowledgeTokens: number;
}): PackResult {
  const total = SITE_TOKEN_BUDGET[input.mode];
  const tokensAvailable = Math.max(0, total - input.knowledgeTokens);

  const ordered = [...input.pages].sort((a, b) => b.importance - a.importance);
  const allocation = allocateBudget(ordered, tokensAvailable);

  const packed: PackedPage[] = [];
  const deferred: PackResult["deferred"] = [];
  let tokensUsed = 0;

  for (const page of ordered) {
    // A page whose only evidence is its own URL tells a model nothing and
    // still costs budget. Defer it and say so, rather than packing a block
    // that invites the model to fill in the blanks from the path.
    if (!hasSubstance(page)) {
      deferred.push({
        id: page.id,
        url: page.url,
        importance: page.importance,
        reason: "No content was captured for this page.",
      });
      continue;
    }

    const allowance = allocation.get(page.id) ?? PAGE_TOKEN_FLOOR;
    if (tokensUsed + PAGE_TOKEN_FLOOR > tokensAvailable) {
      deferred.push({
        id: page.id,
        url: page.url,
        importance: page.importance,
        reason: "Site evidence budget was already full.",
      });
      continue;
    }

    const remaining = tokensAvailable - tokensUsed;
    const text = packPage(page, Math.min(allowance, remaining));
    const tokens = estimateTokens(text);

    packed.push({ id: page.id, url: page.url, text, tokens });
    tokensUsed += tokens;
  }

  return { packed, deferred, tokensUsed, tokensAvailable };
}
