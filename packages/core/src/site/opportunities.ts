/**
 * Site opportunities (Phase 3.3, 3.5, 3.6).
 *
 * Turns Site Intelligence into a ranked list of site-level actions. Every
 * candidate here is found by code from crawl evidence, carries the facts that
 * prove it, names the pages it affects, and has its priority computed by
 * `sitePriority`. The AI layer later rewrites the wording of the top ones; it
 * cannot add a candidate, drop a fact, or change a score.
 *
 * The wording below is the fallback the user sees when no AI has run. It
 * follows the knowledge corpus policies the page checks already follow: no
 * character counts for titles or descriptions, no word-count targets, no
 * promised rankings.
 */

import { pageKeyOf } from "../crawl/url";
import { type CheckId, type CheckSeverity, checkRecommendation, checks } from "../scoring/page-audit";
import type { SiteIntelligence, SitePage } from "./intelligence";
import { type Effort, type PriorityResult, sitePriority } from "./priority";
import { containment, termSet, titleTopic } from "./terms";

export type OpportunityCategory =
  | "content"
  | "technical"
  | "onpage"
  | "performance"
  | "structured-data"
  | "internal-links";

export type AffectedPage = { key: string; url: string; path: string };

export type OpportunityLink = { from: string; to: string; anchor?: string; shared?: string[] };

export type SiteOpportunityCandidate = {
  /** Stable across crawls, so a stored opportunity keeps its status and history. */
  key: string;
  category: OpportunityCategory;
  title: string;
  rationale: string;
  action: string;
  /** Verifiable statements from the crawl. Numbers here are what the AI may cite. */
  facts: string[];
  affected: AffectedPage[];
  affectedCount: number;
  effort: Effort;
  /** 0..1 confidence in the evidence. */
  confidence: number;
  priority: PriorityResult;
  /** Check ids this relates to, for knowledge retrieval. */
  checks: string[];
  /** The graph edges or page pairs a link opportunity is about. */
  links?: OpportunityLink[];
};

const MAX_FACTS = 8;
const MAX_AFFECTED = 50;
const LABEL = Object.fromEntries(checks.map((check) => [check.id, check.label])) as Record<CheckId, string>;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString("en")} ${count === 1 ? singular : pluralForm}`;
}

type CheckProfile = {
  category: OpportunityCategory;
  /** 0..1: how much the condition keeps pages out of search. */
  indexability: number;
  effort: (affected: number) => Effort;
  title: (affected: number, typeHint: string) => string;
  rationale: string;
  /** One fix applies to the whole site (a robots.txt), not page by page. */
  siteWide?: boolean;
};

const perPage = (few: Effort, many: Effort) => (affected: number) => (affected > 10 ? many : few);

const CHECK_PROFILE: Record<CheckId, CheckProfile> = {
  status: {
    category: "technical",
    indexability: 1,
    effort: () => "medium",
    title: (n) => `Fix ${plural(n, "page")} that return errors`,
    rationale:
      "A page that answers with an error cannot be indexed, and every internal link pointing at it sends visitors and crawlers nowhere.",
  },
  indexability: {
    category: "technical",
    indexability: 1,
    effort: () => "low",
    title: (n) => `Resolve conflicting index signals on ${plural(n, "page")}`,
    rationale:
      "These pages send contradictory signals: the sitemap or robots.txt says one thing and the page says another. Search engines resolve the conflict their own way, which may not be yours.",
  },
  canonical: {
    category: "technical",
    indexability: 0.3,
    effort: () => "low",
    title: (n) => `Add canonical links to ${plural(n, "page")}`,
    rationale:
      "Without a canonical link, search engines choose which address of a duplicated page to show, which can split signals across variants of the same page.",
  },
  robots: {
    category: "technical",
    indexability: 0.6,
    effort: () => "low",
    siteWide: true,
    title: () => "Make robots.txt reachable",
    rationale:
      "Crawlers request robots.txt before anything else. When it cannot be fetched, some crawlers slow down or pause crawling the site.",
  },
  sitemap: {
    category: "technical",
    indexability: 0.2,
    effort: () => "low",
    siteWide: true,
    title: () => "Declare a sitemap in robots.txt",
    rationale: "A sitemap declared in robots.txt helps search engines find every URL you want indexed.",
  },
  title: {
    category: "onpage",
    indexability: 0,
    effort: perPage("low", "medium"),
    title: (n, hint) => `Add titles to ${plural(n, "page")}${hint}`,
    rationale:
      "The title is the main text of the search result link. A page without one gets a title chosen for it, usually from its headings.",
  },
  meta: {
    category: "onpage",
    indexability: 0,
    effort: perPage("low", "medium"),
    title: (n, hint) => `Write meta descriptions for ${plural(n, "page")}${hint}`,
    rationale:
      "Search engines may use the meta description as the result snippet. Without one, the snippet is taken from page text, which may not describe the page well.",
  },
  h1: {
    category: "onpage",
    indexability: 0,
    effort: perPage("low", "medium"),
    title: (n, hint) => `Give ${plural(n, "page")} a clear top-level heading${hint}`,
    rationale: "A clear top-level heading tells readers and search engines what the page is about.",
  },
  h2: {
    category: "onpage",
    indexability: 0,
    effort: () => "medium",
    title: (n, hint) => `Add section headings to ${plural(n, "page")}${hint}`,
    rationale: "Section headings make a page scannable and show how its content is organised.",
  },
  images: {
    category: "onpage",
    indexability: 0,
    effort: perPage("low", "medium"),
    title: (n, hint) => `Add alt text to images on ${plural(n, "page")}${hint}`,
    rationale:
      "Alt text describes an image to screen readers and to search engines, which cannot see it. It has to be written by someone who can see the image.",
  },
  links: {
    category: "internal-links",
    indexability: 0,
    effort: () => "medium",
    title: (n, hint) => `Add internal links to ${plural(n, "page")} that ${n === 1 ? "links" : "link"} nowhere${hint}`,
    rationale:
      "A page with no links to the rest of the site is a dead end for visitors and passes no context to related pages.",
  },
  words: {
    category: "content",
    indexability: 0,
    effort: () => "high",
    title: (n, hint) => `Expand thin content on ${plural(n, "page")}${hint}`,
    rationale:
      "These pages may not cover their topic fully enough to answer a visitor's question. Completeness is the goal, not length.",
  },
  schema: {
    category: "structured-data",
    indexability: 0,
    effort: () => "medium",
    title: (n, hint) => `Add structured data to ${plural(n, "page")}${hint}`,
    rationale:
      "Structured data states what a page represents in a form search engines read directly, and makes it eligible for rich results.",
  },
};

type Context = {
  intel: SiteIntelligence;
  byKey: Map<string, SitePage>;
  failedByKey: Map<string, { url: string }>;
  total: number;
  /** 0..1: share of the known site the crawl analysed. */
  coverage: number;
};

function affectedPage(context: Context, key: string): AffectedPage {
  const page = context.byKey.get(key);
  const url = page?.url ?? context.failedByKey.get(key)?.url ?? `https://${key}`;
  let path = page?.path ?? url;
  try {
    path = page?.path ?? new URL(url).pathname;
  } catch {
    // Keep the URL as its own label.
  }
  return { key, url, path };
}

function importanceOf(context: Context, keys: string[]): number[] {
  return keys.map((key) => context.byKey.get(key)?.importance ?? 0.5);
}

/** " (mostly service pages)" when most affected pages share one known type. */
function typeHint(context: Context, keys: string[]): string {
  if (keys.length < 2) return "";
  const counts = new Map<string, number>();
  for (const key of keys) {
    const type = context.byKey.get(key)?.pageType;
    if (type && type !== "other") counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const [type, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!type || !count || count / keys.length < 0.6) return "";
  return count === keys.length ? ` (all ${type} pages)` : ` (mostly ${type} pages)`;
}

function typeBreakdown(context: Context, keys: string[]): string | null {
  const counts = new Map<string, number>();
  for (const key of keys) {
    const type = context.byKey.get(key)?.pageType ?? "unclassified";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  if (counts.size < 2) return null;
  return `By page type: ${[...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type} ${count}`)
    .join(", ")}.`;
}

function examples(context: Context, keys: string[], limit = 3): string {
  return keys
    .slice(0, limit)
    .map((key) => affectedPage(context, key).path)
    .join(", ");
}

function candidate(
  context: Context,
  input: Omit<SiteOpportunityCandidate, "priority" | "affected" | "affectedCount" | "facts"> & {
    facts: Array<string | null>;
    keys: string[];
    severity: CheckSeverity;
    /** Defaults to the affected pages. Override for findings not measured in pages. */
    reach?: { affected: number; total: number };
    importance?: number[] | null;
    indexability?: number;
    performance?: number;
  },
): SiteOpportunityCandidate {
  const { keys, severity, reach, importance, indexability, performance, facts, ...rest } = input;
  const affected = keys.slice(0, MAX_AFFECTED).map((key) => affectedPage(context, key));
  return {
    ...rest,
    facts: facts.filter((fact): fact is string => Boolean(fact)).slice(0, MAX_FACTS),
    affected,
    affectedCount: keys.length,
    priority: sitePriority({
      severity,
      affectedPages: reach?.affected ?? keys.length,
      totalPages: reach?.total ?? context.total,
      importance: importance === undefined ? (keys.length ? importanceOf(context, keys) : null) : importance,
      indexabilityImpact: indexability ?? 0,
      performanceImpact: performance ?? 0,
      effort: rest.effort,
      confidence: rest.confidence,
    }),
  };
}

// ------------------------------------------------------------------ checks

function checkCandidates(context: Context): SiteOpportunityCandidate[] {
  const out: SiteOpportunityCandidate[] = [];
  for (const group of context.intel.issues) {
    const profile = CHECK_PROFILE[group.checkId as CheckId];
    if (!profile) continue;
    const keys = group.pages;
    const n = keys.length;
    const label = LABEL[group.checkId as CheckId] ?? group.checkId;
    out.push(
      candidate(context, {
        key: `check:${group.checkId}`,
        category: profile.category,
        title: profile.title(n, typeHint(context, keys)),
        rationale: profile.rationale,
        action: checkRecommendation(group.checkId as CheckId),
        facts: profile.siteWide
          ? [`The "${label}" check fails for the whole site, so every crawled page reports it.`]
          : [
              `The "${label}" check ${group.status === "fail" ? "fails" : "warns"} on ${plural(n, "page")} of ${plural(context.total, "crawled page")}.`,
              typeBreakdown(context, keys),
              `Examples: ${examples(context, keys)}.`,
            ],
        keys: profile.siteWide ? [] : keys,
        reach: profile.siteWide ? { affected: context.total, total: context.total } : undefined,
        importance: profile.siteWide ? [1] : undefined,
        severity: group.severity as CheckSeverity,
        indexability: profile.indexability,
        effort: profile.effort(n),
        // A warning is the check being unsure; a failure is not.
        confidence: group.status === "fail" ? 1 : 0.7,
        checks: [group.checkId],
      }),
    );
  }
  return out;
}

// ------------------------------------------------------------------ links

/**
 * The caveat a partial crawl puts on a finding. Links: a page the crawl did
 * not reach may link to one it did. Pages: the page that seems missing may be
 * one the crawl did not reach.
 */
function coverageFact(context: Context, about: "links" | "pages"): string | null {
  const { analyzed, discovered } = context.intel.coverage;
  if (!discovered || analyzed >= discovered) return null;
  const crawled = `The crawl analysed ${plural(analyzed, "page")} of ${plural(discovered, "known URL")}`;
  return about === "links"
    ? `${crawled}, so links from pages it did not reach are not counted.`
    : `${crawled}, so a matching page may exist beyond the pages it reached.`;
}

function linkCandidates(context: Context): SiteOpportunityCandidate[] {
  const { intel } = context;
  const out: SiteOpportunityCandidate[] = [];
  if (intel.pages.length < 3) return out;

  // A partial crawl cannot see every link, so a page with no inlinks from the
  // pages it did see is less certainly an orphan.
  const graphConfidence = Math.max(0.3, context.coverage);

  const orphans = intel.links.orphans.filter((key) => context.byKey.get(key)?.indexable !== false);
  if (orphans.length > 0) {
    out.push(
      candidate(context, {
        key: "links:orphans",
        category: "internal-links",
        title: `Link to ${plural(orphans.length, "page")} no other page links to`,
        rationale:
          "Search engines find pages mainly by following links. A page nothing links to is hard to discover, and nothing on the site tells a reader or a crawler what it is about.",
        action:
          "Add a link to each of these pages from at least one related page, using anchor text that names the target page's topic.",
        facts: [
          `${plural(orphans.length, "crawled page")} of ${context.total} receive no links from any other crawled page.`,
          `Examples: ${examples(context, orphans)}.`,
          coverageFact(context, "links"),
        ],
        keys: orphans,
        severity: "medium",
        indexability: 0.3,
        effort: "medium",
        confidence: graphConfidence,
        checks: ["links"],
      }),
    );
  }

  const weak = intel.pages.filter(
    (page) =>
      !page.isHomepage &&
      page.indexable !== false &&
      page.inlinks === 1 &&
      ["pricing", "product", "service", "landing", "category"].includes(page.pageType ?? ""),
  );
  if (weak.length > 0) {
    const keys = weak.sort((a, b) => b.importance - a.importance).map((page) => page.key);
    out.push(
      candidate(context, {
        key: "links:weak-key-pages",
        category: "internal-links",
        title: `Strengthen internal links to ${plural(keys.length, "key page")}`,
        rationale:
          "These are commercial pages, but only one other page links to each of them. Internal links are how a site signals which pages matter most.",
        action:
          "Link to these pages from the homepage, navigation or the related pages that discuss the same offering.",
        facts: [
          `${plural(keys.length, "pricing, product, service or landing page")} receive a link from exactly one other crawled page.`,
          `Examples: ${examples(context, keys)}.`,
          coverageFact(context, "links"),
        ],
        keys,
        severity: "medium",
        effort: "low",
        confidence: graphConfidence,
        checks: ["links"],
      }),
    );
  }

  if (intel.links.broken.length > 0) {
    const sources = [...new Set(intel.links.broken.map((edge) => edge.from))];
    const targets = [...new Set(intel.links.broken.map((edge) => edge.to))];
    out.push(
      candidate(context, {
        key: "links:broken",
        category: "internal-links",
        title: `Fix internal links to ${plural(targets.length, "page")} that return errors`,
        rationale:
          "A link to a page that errors wastes the visitor's click and the crawler's request, and passes no value to anything.",
        action: "Point these links at a working page, or remove them. If the target moved, redirect it.",
        facts: [
          `${plural(intel.links.broken.length, "internal link")} on ${plural(sources.length, "page")} point at ${plural(targets.length, "URL")} that answered with an error.`,
          `Broken targets: ${examples(context, targets)}.`,
        ],
        keys: sources,
        severity: "high",
        indexability: 0.2,
        effort: "low",
        confidence: 1,
        checks: ["links", "status"],
        links: intel.links.broken.slice(0, 20).map((edge) => ({ from: edge.from, to: edge.to, anchor: edge.anchor })),
      }),
    );
  }

  if (intel.links.relatedUnlinked.length > 0) {
    const pairs = intel.links.relatedUnlinked.slice(0, 10);
    const keys = [...new Set(pairs.flatMap((pair) => [pair.a, pair.b]))];
    out.push(
      candidate(context, {
        key: "links:related",
        category: "internal-links",
        title: `Connect ${plural(pairs.length, "pair")} of related pages that do not link to each other`,
        rationale:
          "Pages about the same topic that link to each other help readers go deeper and show search engines how the site's content fits together.",
        action:
          "Add a contextual link in each direction, in a sentence that mentions the other page's topic, with anchor text naming it.",
        facts: pairs
          .slice(0, 5)
          .map(
            (pair) =>
              `${affectedPage(context, pair.a).path} and ${affectedPage(context, pair.b).path} share the words ${pair.shared.map((word) => `"${word}"`).join(", ")} but neither links to the other.`,
          ),
        keys,
        severity: "low",
        importance: importanceOf(context, keys),
        effort: "low",
        // Word overlap suggests relatedness; it does not prove it.
        confidence: 0.6,
        checks: ["links"],
        links: pairs.map((pair) => ({ from: pair.a, to: pair.b, shared: pair.shared })),
      }),
    );
  }

  if (intel.links.genericAnchors.length > 0) {
    const edges = intel.links.genericAnchors;
    const sources = [...new Set(edges.map((edge) => edge.from))];
    const anchors = [...new Set(edges.map((edge) => `"${edge.anchor}"`))].slice(0, 5);
    out.push(
      candidate(context, {
        key: "links:generic-anchors",
        category: "internal-links",
        title: `Replace ${plural(edges.length, "generic link anchor")}`,
        rationale:
          "Anchor text tells readers and search engines what the linked page is about. \"Read more\" or \"click here\" says nothing.",
        action: "Rewrite each anchor to name the target page's topic in a few words.",
        facts: [
          `${plural(edges.length, "internal link")} on ${plural(sources.length, "page")} use generic anchor text: ${anchors.join(", ")}.`,
          `Examples: ${examples(context, sources)}.`,
        ],
        keys: sources,
        severity: "low",
        effort: "low",
        confidence: 1,
        checks: ["links"],
        links: edges.slice(0, 20).map((edge) => ({ from: edge.from, to: edge.to, anchor: edge.anchor })),
      }),
    );
  }

  return out;
}

// ------------------------------------------------------------------ duplicates

function duplicateCandidates(context: Context): SiteOpportunityCandidate[] {
  const { duplicates } = context.intel;
  const out: SiteOpportunityCandidate[] = [];
  const spec = [
    {
      key: "dup:titles",
      groups: duplicates.titles,
      what: "title",
      category: "onpage" as const,
      severity: "medium" as const,
      checks: ["title"],
      rationale:
        "A title should be unique to its page. When several pages share one, search results cannot tell a searcher which page answers their question.",
      action: "Rewrite each duplicate so it names what that particular page covers.",
    },
    {
      key: "dup:meta",
      groups: duplicates.metaDescriptions,
      what: "meta description",
      category: "onpage" as const,
      severity: "medium" as const,
      checks: ["meta"],
      rationale:
        "A shared meta description describes none of its pages well, so search engines are more likely to replace it with page text.",
      action: "Write a description for each page that names its own most relevant points.",
    },
    {
      key: "dup:h1",
      groups: duplicates.h1s,
      what: "H1",
      category: "onpage" as const,
      severity: "low" as const,
      checks: ["h1"],
      rationale: "Pages that share a top-level heading look like the same page to a reader scanning them.",
      action: "Give each page a heading that states what that page, specifically, is about.",
    },
    {
      key: "dup:content",
      groups: duplicates.content,
      what: "body text",
      category: "content" as const,
      severity: "high" as const,
      checks: ["canonical", "words"],
      rationale:
        "Pages with identical text compete with each other. Search engines pick one to show and may filter the rest.",
      action:
        "Merge the duplicates into one page and redirect the others, or point their canonical link at the page you want shown.",
    },
  ];
  for (const item of spec) {
    if (item.groups.length === 0) continue;
    const keys = [...new Set(item.groups.flatMap((group) => group.pages))];
    out.push(
      candidate(context, {
        key: item.key,
        category: item.category,
        title:
          item.what === "body text"
            ? `Consolidate ${plural(keys.length, "page")} with identical content`
            : `Make the ${item.what} unique on ${plural(keys.length, "page")} that share one`,
        rationale: item.rationale,
        action: item.action,
        facts: item.groups.slice(0, 4).map((group) =>
          item.what === "body text"
            ? `${plural(group.pages.length, "page")} have identical text: ${examples(context, group.pages)}.`
            : `"${group.value}" is the ${item.what} of ${plural(group.pages.length, "page")}: ${examples(context, group.pages)}.`,
        ),
        keys,
        severity: item.severity,
        indexability: item.key === "dup:content" ? 0.5 : 0,
        effort: keys.length > 10 ? "medium" : "low",
        confidence: 1,
        checks: item.checks,
      }),
    );
  }
  return out;
}

// ------------------------------------------------------------------ structured data, sitemap, robots

function technicalCandidates(context: Context): SiteOpportunityCandidate[] {
  const { intel } = context;
  const out: SiteOpportunityCandidate[] = [];

  if (intel.schema.invalid.length > 0) {
    const keys = intel.schema.invalid.map((row) => row.key);
    const error = intel.schema.invalid.find((row) => row.error)?.error;
    out.push(
      candidate(context, {
        key: "schema:invalid",
        category: "structured-data",
        title: `Fix JSON-LD that does not parse on ${plural(keys.length, "page")}`,
        rationale:
          "Structured data that is not valid JSON is ignored entirely, so whatever it was meant to say is lost.",
        action: "Validate each JSON-LD block and fix the syntax error. A single stray comma invalidates the whole block.",
        facts: [
          `${plural(keys.length, "page")} carry a JSON-LD block that failed to parse.`,
          error ? `First error: ${error.slice(0, 160)}.` : null,
          `Examples: ${examples(context, keys)}.`,
        ],
        keys,
        severity: "high",
        effort: "low",
        confidence: 1,
        checks: ["schema"],
      }),
    );
  }

  const sitemap = intel.sitemap;
  if (sitemap?.found) {
    const broken = sitemap.brokenUrls ?? [];
    const redirecting = sitemap.redirectingUrls ?? [];
    const noindex = sitemap.noindexUrls ?? [];
    const total = broken.length + redirecting.length + noindex.length;
    if (total > 0) {
      const urls = [...broken, ...redirecting.map((row) => row.url), ...noindex];
      out.push(
        candidate(context, {
          key: "sitemap:entries",
          category: "technical",
          title: `Clean up ${plural(total, "sitemap entry", "sitemap entries")}`,
          rationale:
            "A sitemap should list only the final, indexable address of each page. Entries that error, redirect or say noindex waste crawling and send mixed signals.",
          action:
            "Remove entries that error or say noindex, and replace redirecting entries with the address they redirect to.",
          facts: [
            broken.length ? `${plural(broken.length, "listed URL")} answered with an error.` : null,
            redirecting.length ? `${plural(redirecting.length, "listed URL")} redirect elsewhere.` : null,
            noindex.length ? `${plural(noindex.length, "listed URL")} carry noindex.` : null,
            `Of ${plural(sitemap.urlCount, "URL")} in the sitemap, the crawl checked ${sitemap.sampledCount}.`,
          ],
          keys: urls.map((url) => pageKeyOf(url)),
          severity: broken.length ? "high" : "medium",
          indexability: 0.4,
          effort: "low",
          confidence: 1,
          checks: ["sitemap"],
        }),
      );
    }

    if (intel.notInSitemap.length > 0) {
      const keys = intel.notInSitemap;
      out.push(
        candidate(context, {
          key: "sitemap:missing",
          category: "technical",
          title: `Add ${plural(keys.length, "indexable page")} to the sitemap`,
          rationale:
            "The sitemap is the site's own list of pages it wants indexed. An indexable page left out of it relies on links alone to be found.",
          action: "Add these URLs to the sitemap, or noindex them if they should not be in search.",
          facts: [
            `${plural(keys.length, "indexable crawled page")} are not listed in the site's sitemap.`,
            `Examples: ${examples(context, keys)}.`,
          ],
          keys,
          severity: "medium",
          indexability: 0.2,
          effort: "low",
          confidence: 1,
          checks: ["sitemap"],
        }),
      );
    }
  }

  const robots = intel.robots;
  if (robots?.found) {
    if (robots.blocksEverything) {
      out.push(
        candidate(context, {
          key: "robots:blocks-all",
          category: "technical",
          title: "Stop robots.txt from blocking the whole site",
          rationale:
            "robots.txt disallows the root path for crawlers, so search engines are told not to crawl any page.",
          action:
            'Remove "Disallow: /" from the group that applies to all crawlers, unless keeping the whole site out of search is intended.',
          facts: [`robots.txt at ${robots.url} disallows "/" for the crawler group SEO Maker matched (${robots.appliedAgent ?? "*"}).`],
          keys: [],
          reach: { affected: context.total, total: context.total },
          importance: [1],
          severity: "critical",
          indexability: 1,
          effort: "low",
          confidence: 1,
          checks: ["robots", "robots_audit"],
        }),
      );
    }
    if ((robots.blockedSitemapUrls ?? []).length > 0) {
      const urls = robots.blockedSitemapUrls;
      out.push(
        candidate(context, {
          key: "robots:blocked-sitemap",
          category: "technical",
          title: `Unblock ${plural(urls.length, "sitemap URL")} that robots.txt disallows`,
          rationale:
            "The sitemap asks search engines to index these URLs while robots.txt forbids crawling them. One of the two is wrong.",
          action: "Decide whether these pages belong in search, then fix either the Disallow rule or the sitemap entry.",
          facts: [`robots.txt disallows ${plural(urls.length, "URL")} the sitemap lists, for example ${urls.slice(0, 2).join(", ")}.`],
          keys: urls.map((url) => pageKeyOf(url)),
          severity: "high",
          indexability: 0.8,
          effort: "low",
          confidence: 1,
          checks: ["robots", "robots_audit", "sitemap"],
        }),
      );
    }
    if ((robots.warnings ?? []).length > 0) {
      out.push(
        candidate(context, {
          key: "robots:syntax",
          category: "technical",
          title: `Fix ${plural(robots.warnings.length, "line")} in robots.txt that crawlers ignore`,
          rationale: "Lines a crawler cannot parse are skipped, so the rule they were meant to express does not apply.",
          action: "Correct or remove each line listed.",
          facts: robots.warnings.slice(0, 4).map((warning) => `Line ${warning.line}: "${warning.text}" (${warning.message})`),
          keys: [],
          reach: { affected: 1, total: 1 },
          importance: [1],
          severity: "low",
          effort: "low",
          confidence: 1,
          checks: ["robots_audit"],
        }),
      );
    }
  }

  return out;
}

// ------------------------------------------------------------------ content coverage (website retrieval)

function pathWords(path: string): string {
  return path.replace(/[/_.-]+/g, " ");
}

/** Words a page states its focus with: title, H1 and URL. Headings are too broad for "targets". */
function focusTerms(page: SitePage): Set<string> {
  return termSet(titleTopic(page.title), page.h1, pathWords(page.path));
}

function contentCandidates(context: Context): SiteOpportunityCandidate[] {
  const { intel } = context;
  const out: SiteOpportunityCandidate[] = [];
  const pages = intel.pages.filter((page) => page.indexable !== false);
  if (pages.length === 0) return out;
  const focus = pages.map((page) => ({ page, terms: focusTerms(page) }));
  // What the crawl did not reach may hold the page that seems missing.
  const reachFactor = context.coverage;

  const bestMatch = (phrase: string) => {
    const query = termSet(phrase);
    let best = { score: 0, key: null as string | null };
    for (const row of focus) {
      const score = containment(query, row.terms);
      if (score > best.score) best = { score, key: row.page.key };
    }
    return { query, ...best };
  };

  const offerings = intel.business?.offerings ?? [];
  const missingOfferings = offerings.filter((offering) => {
    const match = bestMatch(offering);
    return match.query.size > 0 && match.score < 0.5;
  });
  if (missingOfferings.length > 0) {
    out.push(
      candidate(context, {
        key: "content:offerings",
        category: "content",
        title: `Create pages for ${plural(missingOfferings.length, "listed offering")}`,
        rationale:
          "Your business context lists these offerings, but no crawled page is about them. A searcher looking for one has no page to land on.",
        action:
          "Create a page for each offering that explains what it is, who it is for and how to get it, or retitle an existing page that covers it.",
        facts: [
          ...missingOfferings.slice(0, 5).map((offering) => `No crawled page's title, H1 or URL names "${offering}".`),
          coverageFact(context, "pages"),
        ],
        keys: [],
        reach: { affected: missingOfferings.length, total: offerings.length },
        importance: null,
        severity: "high",
        effort: "high",
        confidence: Math.round(0.8 * reachFactor * 100) / 100,
        checks: ["words"],
      }),
    );
  }

  const keywords = intel.business?.targetKeywords ?? [];
  const untargeted = keywords.filter((keyword) => {
    const match = bestMatch(keyword);
    return match.query.size > 0 && match.score < 0.75;
  });
  if (untargeted.length > 0) {
    out.push(
      candidate(context, {
        key: "content:keywords",
        category: "content",
        title: `Give ${plural(untargeted.length, "target keyword")} a page that focuses on it`,
        rationale:
          "A keyword you want to be found for needs a page whose title and main heading are about it. None of the crawled pages states these in its title, H1 or URL.",
        action:
          "Choose the page that best covers each keyword and make its title and H1 say so, or create a page for it if none does.",
        facts: [
          `Not in any crawled page's title, H1 or URL: ${untargeted.slice(0, 6).map((keyword) => `"${keyword}"`).join(", ")}.`,
          coverageFact(context, "pages"),
        ],
        keys: [],
        reach: { affected: untargeted.length, total: keywords.length },
        importance: null,
        severity: "medium",
        effort: "medium",
        // Matching words is not matching meaning.
        confidence: Math.round(0.6 * reachFactor * 100) / 100,
        checks: ["title", "h1"],
      }),
    );
  }

  // Missing trust pages, only when the crawl saw most of the site.
  const types = new Set(intel.pages.map((page) => page.pageType));
  if (context.coverage >= 0.9 && intel.pages.length >= 5) {
    const missing = (["about", "contact"] as const).filter((type) => !types.has(type));
    const pageName = { about: "an about page", contact: "a contact page" } as const;
    if (missing.length > 0) {
      out.push(
        candidate(context, {
          key: "content:trust-pages",
          category: "content",
          title: `Add ${missing.map((type) => pageName[type]).join(" and ")}`,
          rationale:
            "Saying who runs a site and how to reach them helps visitors trust it. Google's quality rater guidelines treat that transparency as a trust signal.",
          action: "Publish the missing page and link to it from the site footer.",
          facts: [`None of the ${plural(intel.pages.length, "crawled page")} is classified as ${missing.join(" or ")}.`],
          keys: [],
          reach: { affected: missing.length, total: 2 },
          importance: null,
          severity: "low",
          effort: "low",
          confidence: 0.5,
          checks: [],
        }),
      );
    }
  }

  return out;
}

// ------------------------------------------------------------------ performance

function performanceCandidates(context: Context): SiteOpportunityCandidate[] {
  const summary = context.intel.performance;
  if (!summary) return [];
  const strategy = summary.mobile ? "mobile" : "desktop";
  const data = summary.mobile ?? summary.desktop;
  if (!data) return [];
  const out: SiteOpportunityCandidate[] = [];

  const metrics = [
    {
      id: "lcp",
      tally: data.lcp,
      name: "Largest Contentful Paint",
      effort: "high" as const,
      poorLabel: "over 4 s",
      niLabel: "2.5 to 4 s",
      action:
        "Find each page's largest element above the fold (usually the hero image or heading) and make it load sooner: serve it smaller, preload it, and remove render-blocking resources before it.",
    },
    {
      id: "cls",
      tally: data.cls,
      name: "Cumulative Layout Shift",
      effort: "medium" as const,
      poorLabel: "over 0.25",
      niLabel: "0.1 to 0.25",
      action:
        "Reserve space for images, embeds and ads with explicit dimensions, and avoid inserting content above what is already on screen.",
    },
    {
      id: "tbt",
      tally: data.tbt,
      name: "Total Blocking Time",
      effort: "high" as const,
      poorLabel: "over 600 ms",
      niLabel: "200 to 600 ms",
      action:
        "Reduce the JavaScript that runs during load: split bundles, defer non-critical scripts, and remove unused code.",
    },
  ];

  for (const metric of metrics) {
    const keys = [...metric.tally.poorPages, ...metric.tally.needsImprovementPages];
    if (keys.length === 0) continue;
    const poor = metric.tally.poor;
    out.push(
      candidate(context, {
        key: `perf:${metric.id}:${strategy}`,
        category: "performance",
        title: `Improve ${metric.name} on ${plural(keys.length, "page")} (${strategy})`,
        rationale:
          metric.id === "tbt"
            ? "Total Blocking Time is the lab measure closest to responsiveness. While the main thread is blocked, the page cannot react to a tap or a click."
            : `${metric.name} is one of the Core Web Vitals, which measure the loading and stability experience of real visitors.`,
        action: metric.action,
        facts: [
          poor ? `${metric.name} is poor (${metric.poorLabel}) on ${plural(poor, "page")} of ${metric.tally.measured} measured (${strategy}).` : null,
          metric.tally.needsImprovement
            ? `${metric.name} needs improvement (${metric.niLabel}) on ${plural(metric.tally.needsImprovement, "page")}.`
            : null,
          `Worst: ${examples(context, keys)}.`,
          "Measured by one Lighthouse lab run per page, not by field data from real visitors.",
        ],
        keys,
        reach: { affected: keys.length, total: Math.max(metric.tally.measured, keys.length) },
        severity: poor ? "high" : "medium",
        performance: poor ? 1 : 0.5,
        effort: metric.effort,
        confidence: 0.8,
        checks: [],
      }),
    );
  }

  for (const audit of summary.topAudits.filter((row) => row.totalSavingsMs >= 500).slice(0, 2)) {
    out.push(
      candidate(context, {
        key: `perf:audit:${audit.id}`,
        category: "performance",
        title: `${audit.title} (${plural(audit.pages, "page")})`,
        rationale:
          "Lighthouse flagged this on several pages, so one change to a shared template or asset may speed up all of them.",
        action: `Address "${audit.title}" in the shared layout or assets these pages load, then re-run PageSpeed to confirm.`,
        facts: [
          `Lighthouse estimates about ${(audit.totalSavingsMs / 1000).toFixed(1)} s of savings in total across ${plural(audit.pages, "page")} (${strategy}).`,
          `Pages: ${examples(context, audit.pageKeys)}.`,
        ],
        keys: audit.pageKeys,
        reach: { affected: audit.pages, total: Math.max(summary.pagesMeasured, audit.pages) },
        severity: "medium",
        performance: 0.6,
        effort: "medium",
        confidence: 0.8,
        checks: [],
      }),
    );
  }

  return out;
}

// ------------------------------------------------------------------ entry point

/**
 * Every site-level opportunity the evidence supports, ranked by priority.
 * Ties break on reach, then key, so the order is fully reproducible.
 */
export function deriveSiteOpportunities(intel: SiteIntelligence): SiteOpportunityCandidate[] {
  const context: Context = {
    intel,
    byKey: new Map(intel.pages.map((page) => [page.key, page])),
    failedByKey: new Map(intel.failedPages.map((page) => [page.key, page])),
    total: Math.max(1, intel.pages.length + intel.failedPages.length),
    coverage: intel.coverage.ratio ?? 0.6,
  };

  const all = [
    ...checkCandidates(context),
    ...linkCandidates(context),
    ...duplicateCandidates(context),
    ...technicalCandidates(context),
    ...contentCandidates(context),
    ...performanceCandidates(context),
  ];

  return all.sort(
    (a, b) =>
      b.priority.score - a.priority.score ||
      b.affectedCount - a.affectedCount ||
      a.key.localeCompare(b.key),
  );
}
