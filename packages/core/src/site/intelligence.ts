/**
 * Site Intelligence (Phase 3.1 / architecture §6).
 *
 * The normalized representation of a whole crawled site, built only from what
 * the crawl stored: the page rows, their persisted issues, the link and schema
 * evidence, the crawl's robots and sitemap audits, and PageSpeed runs. Every
 * site-level feature reads this shape instead of re-deriving its own view.
 *
 * It never carries page bodies. A site-level prompt gets titles, headings and
 * numbers, which is what architecture §6 asks for: "do not send every page's
 * entire content to the LLM for every site-level task".
 *
 * Pure: the caller loads the rows, this function only computes. That keeps the
 * whole thing testable without a database, and lets the web app and the worker
 * build exactly the same picture.
 */

import { pageKeyOf, sectionOf } from "../crawl/url";
import { readEvidence } from "../page/intelligence";
import type { RobotsAudit } from "../robots/audit";
import type { SitemapAudit } from "../sitemap/audit";
import { type PerformanceRunInput, type PerformanceSummary, summarizePerformance } from "./performance";
import { normalizeText, overlap, sharedTerms, titleTopic, tokenize } from "./terms";

export type SitePageInput = {
  id: string;
  url: string;
  finalUrl: string | null;
  status: string;
  statusCode: number | null;
  pageType: string | null;
  searchIntent: string | null;
  title: string | null;
  metaDesc: string | null;
  h1: string | null;
  wordCount: number | null;
  /** Internal anchors on the page, as the crawler counted them. */
  internalLinks: number | null;
  canonicalUrl: string | null;
  indexable: boolean | null;
  inSitemap: boolean | null;
  robotsDisallowed: boolean | null;
  depth: number | null;
  discoveredVia: string | null;
  contentHash: string | null;
  /** The Page.evidence JSON column (PageEvidence), read defensively. */
  evidence: unknown;
  /** Persisted PageIssue rows for this page. */
  issues: Array<{ checkId: string; status: string; severity: string }>;
};

export type SiteCrawlInput = {
  discovered: number;
  analyzed: number;
  maxPages: number;
  robotsAudit: unknown;
  sitemapAudit: unknown;
};

export type SiteBusinessInput = {
  offerings: string[];
  targetKeywords: string[];
};

export type BuildSiteIntelligenceInput = {
  rootUrl: string;
  pages: SitePageInput[];
  performance?: PerformanceRunInput[];
  crawl?: SiteCrawlInput | null;
  /** Deep mode only. Null in Quick mode, and nothing is inferred in its place. */
  business?: SiteBusinessInput | null;
};

export type SitePage = {
  /** pageKeyOf(finalUrl ?? url): the identity results are stored under. */
  key: string;
  id: string;
  url: string;
  path: string;
  section: string;
  pageType: string | null;
  searchIntent: string | null;
  title: string | null;
  metaDesc: string | null;
  h1: string | null;
  wordCount: number | null;
  internalLinks: number | null;
  indexable: boolean | null;
  inSitemap: boolean | null;
  depth: number | null;
  discoveredVia: string | null;
  isHomepage: boolean;
  schemaTypes: string[];
  invalidSchemaBlocks: number;
  /** H2 texts, capped. */
  headings: string[];
  /** Words that say what this page is about, with site-wide boilerplate removed. */
  topicTerms: string[];
  /** Failing and warning check ids. */
  failing: string[];
  /** Distinct crawled pages linking here. */
  inlinks: number;
  /** Distinct crawled pages this page links to. */
  outlinks: number;
  /** 0..1, deterministic. See `pageImportance`. */
  importance: number;
};

export type FailedPage = {
  key: string;
  id: string;
  url: string;
  statusCode: number | null;
};

export type LinkEdge = {
  from: string;
  to: string;
  /** First non-empty anchor seen for this pair. Empty when every link was an image. */
  anchor: string;
};

export type IssueGroup = {
  checkId: string;
  /** Worst severity across the affected pages. */
  severity: string;
  /** "fail" when any page fails it outright, else "warning". */
  status: string;
  pages: string[];
};

export type DuplicateGroup = { value: string; pages: string[] };

export type RelatedPair = { a: string; b: string; score: number; shared: string[] };

export type SiteIntelligence = {
  rootUrl: string;
  coverage: {
    /** Pages analysed in this crawl. */
    analyzed: number;
    failed: number;
    /** URLs the crawl knew of (seeds + deferred), when recorded. */
    discovered: number | null;
    /** analyzed / discovered, 0..1. Null when unknown. Findings that depend on
     *  seeing the whole site (orphans, missing pages) are weighted by this. */
    ratio: number | null;
    maxPages: number | null;
  };
  pages: SitePage[];
  failedPages: FailedPage[];
  pageTypes: Record<string, number>;
  issues: IssueGroup[];
  links: {
    edges: LinkEdge[];
    orphans: string[];
    /** Edges whose target answered 4xx/5xx. */
    broken: LinkEdge[];
    genericAnchors: LinkEdge[];
    /** Topically related page pairs with no link in either direction. */
    relatedUnlinked: RelatedPair[];
    averageInlinks: number | null;
  };
  schema: {
    /** Pages per schema.org @type. */
    byType: Record<string, number>;
    /** Indexable analysed pages with no JSON-LD. */
    pagesWithout: string[];
    /** Pages carrying a JSON-LD block that did not parse. */
    invalid: Array<{ key: string; error: string | null }>;
  };
  duplicates: {
    titles: DuplicateGroup[];
    metaDescriptions: DuplicateGroup[];
    h1s: DuplicateGroup[];
    content: DuplicateGroup[];
  };
  /** URL sections with at least two pages, and the words they share. */
  topics: Array<{ section: string; pages: string[]; terms: string[] }>;
  performance: PerformanceSummary | null;
  robots: RobotsAudit | null;
  sitemap: SitemapAudit | null;
  /** Indexable pages the site's own sitemap does not list. Empty without a sitemap. */
  notInSitemap: string[];
  business: SiteBusinessInput | null;
};

const MAX_HEADINGS = 10;
const MAX_TOPIC_TERMS = 12;
const MAX_GROUPS = 15;
const MAX_GROUP_PAGES = 20;
const MAX_RELATED_PAIRS = 20;
const MAX_GENERIC_ANCHORS = 40;
/** Pairs are compared all-to-all, so bound the input. */
const MAX_PAIR_PAGES = 300;
const RELATED_MIN_SCORE = 0.3;

/** Anchors that tell neither a reader nor a search engine where a link goes. */
const GENERIC_ANCHORS = new Set([
  "click here",
  "here",
  "read more",
  "learn more",
  "more",
  "this page",
  "this",
  "link",
  "continue",
  "continue reading",
  "details",
  "more info",
  "more information",
  "find out more",
  "go",
  "see more",
]);

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Page types a business usually wants found in search. */
const COMMERCIAL_TYPES = new Set(["pricing", "product", "service", "landing", "category"]);

export function isGenericAnchor(anchor: string): boolean {
  return GENERIC_ANCHORS.has(normalizeText(anchor).replace(/[.…:!»›→>]+$/u, "").trim());
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

/**
 * How much a page matters to the site, 0..1.
 *
 * Deterministic and explainable: the homepage is the top of the site; depth,
 * internal links pointing in, and a commercial page type raise the rest; a
 * page that asks not to be indexed is not a search entry point at all, and
 * neither is a legal or utility page (login, cart, account).
 *
 * The crawl planner ranks URLs with this same function before they are
 * fetched, so "important" means one thing across the product.
 */
export function pageImportance(input: {
  isHomepage: boolean;
  depth: number | null;
  inlinks: number;
  maxInlinks: number;
  pageType: string | null;
  indexable: boolean | null;
}): number {
  if (input.isHomepage) return 1;
  const depth = input.depth ?? 3;
  let score = depth <= 1 ? 0.55 : depth === 2 ? 0.42 : 0.3;
  if (input.maxInlinks > 0) score += 0.3 * Math.min(1, input.inlinks / input.maxInlinks);
  if (input.pageType && COMMERCIAL_TYPES.has(input.pageType)) score += 0.15;
  if (input.pageType === "article" || input.pageType === "documentation" || input.pageType === "about") {
    score += 0.05;
  }
  if (input.pageType === "legal" || input.pageType === "utility") score -= 0.2;
  if (input.indexable === false) score *= 0.3;
  return Math.round(Math.max(0.05, Math.min(1, score)) * 100) / 100;
}

function duplicateGroups(pages: SitePage[], value: (page: SitePage) => string | null): DuplicateGroup[] {
  const groups = new Map<string, { value: string; pages: string[] }>();
  for (const page of pages) {
    const raw = value(page);
    const key = normalizeText(raw);
    if (!raw || !key) continue;
    const group = groups.get(key) ?? { value: raw.trim(), pages: [] };
    group.pages.push(page.key);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.pages.length > 1)
    .sort((a, b) => b.pages.length - a.pages.length || a.value.localeCompare(b.value))
    .slice(0, MAX_GROUPS)
    .map((group) => ({ value: group.value.slice(0, 200), pages: group.pages.slice(0, MAX_GROUP_PAGES) }));
}

function readAudit<T>(value: unknown, required: string): T | null {
  return value && typeof value === "object" && required in (value as object) ? (value as T) : null;
}

export function buildSiteIntelligence(input: BuildSiteIntelligenceInput): SiteIntelligence {
  const analyzedRows = input.pages.filter((page) => page.status === "analyzed");
  const failedRows = input.pages.filter((page) => page.status === "failed");

  // Every address a page answered under maps to one key, so a link to the
  // pre-redirect URL still lands on the page it redirects to.
  const alias = new Map<string, string>();
  const keyOf = (page: SitePageInput) => pageKeyOf(page.finalUrl ?? page.url);
  for (const page of [...analyzedRows, ...failedRows]) {
    const key = keyOf(page);
    alias.set(pageKeyOf(page.url), key);
    alias.set(key, key);
  }
  const failedKeys = new Set(failedRows.map(keyOf));
  const rowByKey = new Map(analyzedRows.map((row) => [keyOf(row), row]));
  const rootKey = pageKeyOf(input.rootUrl);

  // ---- link graph
  const edgeMap = new Map<string, LinkEdge>();
  const generic: LinkEdge[] = [];
  for (const page of analyzedRows) {
    const from = keyOf(page);
    for (const link of readEvidence(page.evidence).links) {
      if (!link.internal) continue;
      const to = alias.get(pageKeyOf(link.href));
      if (!to || to === from) continue;
      const pair = `${from}\u0000${to}`;
      const anchor = link.anchor.trim();
      const existing = edgeMap.get(pair);
      if (!existing) {
        edgeMap.set(pair, { from, to, anchor });
      } else if (!existing.anchor && anchor) {
        existing.anchor = anchor;
      }
      if (anchor && isGenericAnchor(anchor) && generic.length < MAX_GENERIC_ANCHORS) {
        generic.push({ from, to, anchor });
      }
    }
  }
  const edges = [...edgeMap.values()];
  const inlinks = new Map<string, Set<string>>();
  const outlinks = new Map<string, Set<string>>();
  for (const edge of edges) {
    (inlinks.get(edge.to) ?? inlinks.set(edge.to, new Set()).get(edge.to)!).add(edge.from);
    (outlinks.get(edge.from) ?? outlinks.set(edge.from, new Set()).get(edge.from)!).add(edge.to);
  }
  const maxInlinks = Math.max(0, ...analyzedRows.map((page) => inlinks.get(keyOf(page))?.size ?? 0));

  // ---- topic terms, with words on most pages (brand, nav) treated as boilerplate
  const rawTerms = new Map<string, Map<string, number>>();
  const documentFrequency = new Map<string, number>();
  for (const page of analyzedRows) {
    const weights = new Map<string, number>();
    const add = (text: string | null | undefined, weight: number) => {
      for (const word of tokenize(text)) weights.set(word, (weights.get(word) ?? 0) + weight);
    };
    add(titleTopic(page.title), 2);
    add(page.h1, 2);
    for (const heading of readEvidence(page.evidence).headings.filter((h) => h.level === 2).slice(0, MAX_HEADINGS)) {
      add(heading.text, 1);
    }
    rawTerms.set(keyOf(page), weights);
    for (const word of weights.keys()) documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
  }
  const boilerplate = (word: string) =>
    analyzedRows.length >= 4 && (documentFrequency.get(word) ?? 0) / analyzedRows.length > 0.5;

  // ---- pages
  const pages: SitePage[] = analyzedRows.map((row) => {
    const key = keyOf(row);
    const url = row.finalUrl ?? row.url;
    const evidence = readEvidence(row.evidence);
    const path = pathOf(url);
    const isHomepage = key === rootKey || path === "/";
    const weights = rawTerms.get(key) ?? new Map<string, number>();
    const topicTerms = [...weights.entries()]
      .filter(([word]) => !boilerplate(word))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_TOPIC_TERMS)
      .map(([word]) => word);
    const inbound = inlinks.get(key)?.size ?? 0;
    return {
      key,
      id: row.id,
      url,
      path,
      section: sectionOf(url),
      pageType: row.pageType,
      searchIntent: row.searchIntent,
      title: row.title,
      metaDesc: row.metaDesc,
      h1: row.h1,
      wordCount: row.wordCount,
      internalLinks: row.internalLinks,
      indexable: row.indexable,
      inSitemap: row.inSitemap,
      depth: row.depth,
      discoveredVia: row.discoveredVia,
      isHomepage,
      schemaTypes: [...new Set(evidence.schema.flatMap((block) => block.types))].sort(),
      invalidSchemaBlocks: evidence.schema.filter((block) => !block.valid).length,
      headings: evidence.headings
        .filter((heading) => heading.level === 2)
        .slice(0, MAX_HEADINGS)
        .map((heading) => heading.text),
      topicTerms,
      failing: [...new Set(row.issues.map((issue) => issue.checkId))],
      inlinks: inbound,
      outlinks: outlinks.get(key)?.size ?? 0,
      importance: pageImportance({
        isHomepage,
        depth: row.depth,
        inlinks: inbound,
        maxInlinks,
        pageType: row.pageType,
        indexable: row.indexable,
      }),
    };
  });

  // ---- issue distribution, across analysed and failed pages
  const groups = new Map<string, IssueGroup>();
  for (const row of [...analyzedRows, ...failedRows]) {
    for (const issue of row.issues) {
      const group = groups.get(issue.checkId) ?? {
        checkId: issue.checkId,
        severity: issue.severity,
        status: issue.status,
        pages: [],
      };
      if ((SEVERITY_RANK[issue.severity] ?? 9) < (SEVERITY_RANK[group.severity] ?? 9)) group.severity = issue.severity;
      if (issue.status === "fail") group.status = "fail";
      const key = keyOf(row);
      if (!group.pages.includes(key)) group.pages.push(key);
      groups.set(issue.checkId, group);
    }
  }
  const issues = [...groups.values()].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
      b.pages.length - a.pages.length ||
      a.checkId.localeCompare(b.checkId),
  );

  // ---- related pages with no link between them
  const linked = (a: string, b: string) => edgeMap.has(`${a}\u0000${b}`) || edgeMap.has(`${b}\u0000${a}`);
  // Legal pages share template headings ("Regional disclosures") and are not
  // where a reader is meant to go next, so they are left out of pairing.
  const candidates = pages
    .filter((page) => page.indexable !== false && page.pageType !== "legal" && page.topicTerms.length >= 2)
    .slice(0, MAX_PAIR_PAGES);
  const termSets = new Map(candidates.map((page) => [page.key, new Set(page.topicTerms)]));
  const related: RelatedPair[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.isHomepage || b.isHomepage || linked(a.key, b.key)) continue;
      const setA = termSets.get(a.key)!;
      const setB = termSets.get(b.key)!;
      const score = overlap(setA, setB);
      const shared = sharedTerms(setA, setB);
      if (score >= RELATED_MIN_SCORE && shared.length >= 2) {
        related.push({ a: a.key, b: b.key, score: Math.round(score * 100) / 100, shared: shared.slice(0, 6) });
      }
    }
  }
  related.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

  // ---- page types
  const pageTypes: Record<string, number> = {};
  for (const page of pages) {
    const type = page.pageType ?? "unknown";
    pageTypes[type] = (pageTypes[type] ?? 0) + 1;
  }

  // ---- schema inventory
  const byType: Record<string, number> = {};
  for (const page of pages) for (const type of page.schemaTypes) byType[type] = (byType[type] ?? 0) + 1;

  // ---- topics by URL section
  const sections = new Map<string, SitePage[]>();
  for (const page of pages) {
    if (page.isHomepage) continue;
    sections.set(page.section, [...(sections.get(page.section) ?? []), page]);
  }
  const topics = [...sections.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([section, members]) => {
      const counts = new Map<string, number>();
      for (const member of members) for (const word of member.topicTerms) counts.set(word, (counts.get(word) ?? 0) + 1);
      const terms = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([word]) => word);
      return { section, pages: members.map((member) => member.key).slice(0, MAX_GROUP_PAGES), terms };
    })
    .sort((a, b) => b.pages.length - a.pages.length || a.section.localeCompare(b.section))
    .slice(0, MAX_GROUPS);

  const indexablePages = pages.filter((page) => page.indexable !== false);
  const robots = readAudit<RobotsAudit>(input.crawl?.robotsAudit, "found");
  const sitemap = readAudit<SitemapAudit>(input.crawl?.sitemapAudit, "found");
  const discovered = input.crawl && input.crawl.discovered > 0 ? input.crawl.discovered : null;

  const orphanPages = pages.filter((page) => !page.isHomepage && page.inlinks === 0);

  return {
    rootUrl: input.rootUrl,
    coverage: {
      analyzed: pages.length,
      failed: failedRows.length,
      discovered,
      ratio: discovered ? Math.min(1, Math.round((pages.length / discovered) * 100) / 100) : null,
      maxPages: input.crawl?.maxPages ?? null,
    },
    pages,
    failedPages: failedRows.map((row) => ({
      key: keyOf(row),
      id: row.id,
      url: row.finalUrl ?? row.url,
      statusCode: row.statusCode,
    })),
    pageTypes,
    issues,
    links: {
      edges,
      orphans: orphanPages.sort((a, b) => b.importance - a.importance || a.key.localeCompare(b.key)).map((page) => page.key),
      broken: edges.filter((edge) => failedKeys.has(edge.to)),
      genericAnchors: generic,
      relatedUnlinked: related.slice(0, MAX_RELATED_PAIRS),
      averageInlinks: pages.length
        ? Math.round((pages.reduce((sum, page) => sum + page.inlinks, 0) / pages.length) * 10) / 10
        : null,
    },
    schema: {
      byType,
      pagesWithout: indexablePages.filter((page) => page.schemaTypes.length === 0).map((page) => page.key),
      invalid: pages
        .filter((page) => page.invalidSchemaBlocks > 0)
        .map((page) => ({
          key: page.key,
          error: readEvidence(rowByKey.get(page.key)?.evidence).schema.find((block) => !block.valid)?.error ?? null,
        })),
    },
    duplicates: {
      titles: duplicateGroups(indexablePages, (page) => page.title),
      metaDescriptions: duplicateGroups(indexablePages, (page) => page.metaDesc),
      h1s: duplicateGroups(indexablePages, (page) => page.h1),
      content: duplicateGroups(indexablePages, (page) => rowByKey.get(page.key)?.contentHash ?? null),
    },
    topics,
    performance: summarizePerformance(input.performance ?? []),
    robots,
    sitemap,
    notInSitemap: sitemap?.found
      ? indexablePages.filter((page) => page.inSitemap === false).map((page) => page.key)
      : [],
    business:
      input.business && (input.business.offerings.length || input.business.targetKeywords.length)
        ? input.business
        : null,
  };
}
