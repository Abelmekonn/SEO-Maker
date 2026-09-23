/**
 * Choosing which pages the GEO layer looks at.
 *
 * Two decisions here matter more than the arithmetic:
 *
 *  1. Importance is measured by INBOUND internal links, not `Page.internalLinks`.
 *     That column counts outgoing links, which measures how much of a hub a page
 *     is, not how much the site points at it. The inbound map is built from
 *     every page's own link evidence, so it costs nothing extra.
 *
 *  2. Selection fills per-type quotas before it fills by rank. Pure top-N on a
 *     blog-heavy site picks thirty articles and no service page, which would
 *     leave Entity Clarity and Service Coverage measuring nothing real.
 */

import { normalizePageUrl } from "../crawl/url";
import { readEvidence } from "../page/intelligence";
import { clamp01 } from "./types";

export const MAX_SELECTED_PAGES = { quick: 30, deep: 50 } as const;

/**
 * How much a page type tends to carry business identity.
 *
 * Legal pages sit at the bottom rather than being excluded outright: on a site
 * with almost no content they may be all there is, and reporting nothing would
 * be worse than reporting what little exists.
 */
export const TYPE_WEIGHT: Record<string, number> = {
  homepage: 1.0,
  service: 0.95,
  pricing: 0.9,
  product: 0.85,
  about: 0.8,
  contact: 0.75,
  category: 0.6,
  documentation: 0.6,
  article: 0.5,
  landing: 0.45,
  other: 0.4,
  legal: 0.1,
};

/** Filled in importance order before any remaining slots go to the global ranking. */
export const TYPE_QUOTAS: Record<string, number> = {
  service: 8,
  product: 6,
  article: 6,
  category: 4,
  documentation: 4,
  pricing: 3,
  about: 2,
  contact: 2,
  landing: 2,
};

export type SelectablePage = {
  id: string;
  url: string;
  status: string;
  statusCode: number | null;
  pageType: string | null;
  pageTypeScore: number | null;
  depth: number | null;
  inSitemap: boolean | null;
  wordCount: number | null;
  schemaCount: number | null;
  content: string | null;
  /** Raw `Page.evidence` JSON. Read through `readEvidence`, never trusted. */
  evidence: unknown;
};

export type ScoredPage = SelectablePage & { importance: number; inbound: number };

export type SelectionResult = {
  selected: ScoredPage[];
  deferred: ScoredPage[];
};

/**
 * Counts how many crawled pages link to each page.
 *
 * Targets are normalized the same way the crawler normalized `Page.url`, so a
 * link written with a trailing slash still lands on the row it refers to.
 */
export function inboundLinkCounts(pages: SelectablePage[]): Map<string, number> {
  const byUrl = new Map<string, string>();
  for (const page of pages) {
    const normalized = normalizePageUrl(page.url);
    if (normalized) byUrl.set(normalized, page.id);
  }

  const counts = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const link of readEvidence(page.evidence).links) {
      if (!link.internal) continue;
      const normalized = normalizePageUrl(link.href);
      if (!normalized) continue;
      const targetId = byUrl.get(normalized);
      // A page linking to itself, and twenty links to the same target from one
      // nav block, both say nothing about importance.
      if (!targetId || targetId === page.id || seen.has(targetId)) continue;
      seen.add(targetId);
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
  }
  return counts;
}

function depthScore(depth: number | null): number {
  if (depth == null) return 0.15;
  if (depth <= 0) return 1;
  if (depth === 1) return 0.8;
  if (depth === 2) return 0.55;
  if (depth === 3) return 0.3;
  return 0.15;
}

/** Null means "there is no sitemap", which is not the page's fault. */
function sitemapScore(inSitemap: boolean | null): number {
  if (inSitemap == null) return 0.5;
  return inSitemap ? 1 : 0.15;
}

function contentDepth(wordCount: number | null): number {
  if (wordCount == null) return 0.15;
  const raw = clamp01(wordCount / 600);
  return wordCount < 150 ? Math.min(raw, 0.5) : raw;
}

/** 90th percentile, so one enormous hub does not flatten every other page to zero. */
function percentile90(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9));
  return Math.max(1, sorted[index]!);
}

export function pageImportance(
  page: SelectablePage,
  context: { inbound: number; p90Inbound: number },
): number {
  const typeWeight = TYPE_WEIGHT[page.pageType ?? "other"] ?? TYPE_WEIGHT.other!;
  const typeConfidence = clamp01((page.pageTypeScore ?? 0.5) + 0.3);

  return (
    30 * typeWeight * typeConfidence +
    20 * depthScore(page.depth) +
    20 * clamp01(context.inbound / context.p90Inbound) +
    10 * sitemapScore(page.inSitemap) +
    15 * contentDepth(page.wordCount) +
    5 * clamp01((page.schemaCount ?? 0) / 2)
  );
}

/** A page we can actually read. Anything else would contribute nothing but noise. */
function isEligible(page: SelectablePage): boolean {
  if (page.status !== "analyzed") return false;
  if (page.statusCode != null && (page.statusCode < 200 || page.statusCode >= 300)) return false;
  return Boolean(page.content && page.content.trim().length > 0);
}

export function selectImportantPages(
  pages: SelectablePage[],
  options: { mode: "quick" | "deep" },
): SelectionResult {
  const eligible = pages.filter(isEligible);
  const inbound = inboundLinkCounts(eligible);
  const p90 = percentile90(eligible.map((page) => inbound.get(page.id) ?? 0));

  const scored: ScoredPage[] = eligible
    .map((page) => {
      const count = inbound.get(page.id) ?? 0;
      return {
        ...page,
        inbound: count,
        importance: pageImportance(page, { inbound: count, p90Inbound: p90 }),
      };
    })
    .sort((a, b) => b.importance - a.importance);

  const limit = MAX_SELECTED_PAGES[options.mode];
  const chosen = new Map<string, ScoredPage>();

  // 1. The homepage always, when there is one. Every identity check starts there.
  const homepage = scored.find((page) => page.pageType === "homepage");
  if (homepage) chosen.set(homepage.id, homepage);

  // 2. Per-type quotas, so the sample is representative rather than top-heavy.
  for (const [type, quota] of Object.entries(TYPE_QUOTAS)) {
    let taken = 0;
    for (const page of scored) {
      if (chosen.size >= limit) break;
      if (taken >= quota) break;
      if (page.pageType !== type || chosen.has(page.id)) continue;
      chosen.set(page.id, page);
      taken += 1;
    }
  }

  // 3. Remaining slots by rank. Legal pages only if the site has almost nothing
  //    else, in which case reporting on them beats reporting on nothing.
  const allowLegal = scored.filter((page) => page.pageType !== "legal").length < 3;
  for (const page of scored) {
    if (chosen.size >= limit) break;
    if (chosen.has(page.id)) continue;
    if (page.pageType === "legal" && !allowLegal) continue;
    chosen.set(page.id, page);
  }

  const selected = scored.filter((page) => chosen.has(page.id));
  const deferred = scored.filter((page) => !chosen.has(page.id));
  return { selected, deferred };
}
