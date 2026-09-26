/**
 * Site AI: strategy for the whole site.
 *
 *   Site Intelligence + deterministic opportunities + business context
 *     + knowledge -> content opportunities, topic structure, internal-link
 *       strategy, site architecture, content strategy
 *
 * The model sees a compact, labelled picture of the site: sections and the
 * words they share, the most important pages by path and title, the link
 * structure, coverage, and the opportunities code already found. Every item
 * has an evidence id, and every recommendation must cite the ids it rests on.
 * It never sees page bodies, so a site of any size fits one call.
 *
 * The refinement drops anything ungrounded rather than trusting the model:
 * a recommendation citing no known id, a page path the crawl never found, or
 * a number the evidence does not contain.
 */

import type { SiteIntelligence, SiteOpportunityCandidate } from "@seo-maker/core/site";
import type { KnowledgeQuery } from "../knowledge";
import { type SiteStrategy, siteStrategySchema } from "../schemas";
import { ungroundedNumbers } from "./grounding";
import type { BusinessBlock, PageFeatureSpec } from "./page";
import { siteSummary } from "./site";

const MAX_SECTIONS = 10;
const MAX_PAGES = 25;
const MAX_OPPORTUNITIES = 8;
const MAX_LIST = 10;

/** Below this many analysed pages there is no site structure to reason about. */
export const MIN_PAGES_FOR_STRATEGY = 3;

export const SITE_STRATEGY_SYSTEM_PROMPT = [
  "You are the strategy layer of an SEO auditing tool. Code crawled a website and summarised it as EVIDENCE,",
  "where every item has an `id`. You write a site-level strategy from that evidence.",
  "",
  "Rules you must follow without exception:",
  "1. Use only the EVIDENCE and KNOWLEDGE given to you. Never invent a page, URL, product, audience, competitor,",
  "   ranking, traffic figure, keyword volume or indexing status. None of those are in the evidence.",
  "2. Every recommendation lists, in `evidenceRefs`, the evidence ids it rests on, copied exactly.",
  "3. Name pages only by a `path` that appears in the evidence. Never make up a path for a page you suggest creating;",
  "   describe a new page in words instead.",
  "4. Every number you write must appear in the evidence. Do not compute percentages or estimate totals.",
  "5. When the evidence is too thin for a claim (few pages crawled, low coverage), say so and set",
  "   `evidenceSufficient` to false rather than generalising from what little there is.",
  "6. Present search intent and topic inferences as inferences (\"suggests\", \"appears to\"), never as certainty.",
  "7. The BINDING POLICIES section overrides everything; never state a myth as advice, never recommend a word count.",
  "8. When there is no business context, do not guess the business, its audience or its market.",
  "9. In `groundedIn`, list the evidence ids and knowledge item ids you actually used.",
  "",
  "Respond with a single JSON object and no other text.",
].join("\n");

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

export type StrategyEvidence = ReturnType<typeof strategyEvidence>;

/** The labelled site picture the prompt contains. Also hashed into the cache key. */
export function strategyEvidence(intel: SiteIntelligence, candidates: SiteOpportunityCandidate[]) {
  const pathByKey = new Map(intel.pages.map((page) => [page.key, page.path]));
  const pathOfKey = (key: string) => pathByKey.get(key) ?? pathOf(key);

  const pages = [...intel.pages]
    .sort((a, b) => b.importance - a.importance || a.path.localeCompare(b.path))
    .slice(0, MAX_PAGES)
    .map((page) => ({
      id: `page:${page.path}`,
      path: page.path,
      pageType: page.pageType,
      title: page.title,
      h1: page.h1,
      wordCount: page.wordCount,
      linksIn: page.inlinks,
      linksOut: page.outlinks,
      depth: page.depth,
      headings: page.headings.slice(0, 5),
      topics: page.topicTerms.slice(0, 6),
    }));

  const depth: Record<string, number> = {};
  for (const page of intel.pages) {
    const level = page.depth == null ? "unknown" : String(page.depth);
    depth[level] = (depth[level] ?? 0) + 1;
  }

  const coverageNotes: string[] = [];
  if (intel.coverage.analyzed < MIN_PAGES_FOR_STRATEGY) {
    coverageNotes.push(
      `Only ${intel.coverage.analyzed} page(s) were analysed, which is too few to judge the site's structure.`,
    );
  }
  if (intel.coverage.ratio != null && intel.coverage.ratio < 0.5) {
    coverageNotes.push(
      `The crawl analysed ${intel.coverage.analyzed} of ${intel.coverage.discovered} known URLs; conclusions about the whole site are partial.`,
    );
  }

  return {
    coverage: {
      id: "coverage",
      pagesAnalyzed: intel.coverage.analyzed,
      knownUrls: intel.coverage.discovered,
      notes: coverageNotes,
    },
    site: { id: "site", ...siteSummary(intel) },
    sections: intel.topics.slice(0, MAX_SECTIONS).map((topic) => ({
      id: `section:/${topic.section}`,
      section: `/${topic.section}`,
      pages: topic.pages.length,
      sharedTopics: topic.terms.slice(0, 6),
      examplePages: topic.pages.slice(0, 4).map(pathOfKey),
    })),
    pages,
    links: {
      id: "links",
      averageLinksIn: intel.links.averageInlinks,
      orphanPages: intel.links.orphans.slice(0, MAX_LIST).map(pathOfKey),
      orphanCount: intel.links.orphans.length,
      brokenLinks: intel.links.broken.length,
      genericAnchors: intel.links.genericAnchors.length,
      relatedButUnlinked: intel.links.relatedUnlinked.slice(0, MAX_LIST).map((pair) => ({
        a: pathOfKey(pair.a),
        b: pathOfKey(pair.b),
        shared: pair.shared.slice(0, 4),
      })),
    },
    architecture: {
      id: "architecture",
      pagesByDepth: depth,
      pageTypes: intel.pageTypes,
      notInSitemap: intel.notInSitemap.length,
      sitemapFound: intel.sitemap ? intel.sitemap.found : null,
      sitemapUrls: intel.sitemap ? intel.sitemap.urlCount : null,
      pagesWithoutStructuredData: intel.schema.pagesWithout.length,
      duplicateTitles: intel.duplicates.titles.length,
      duplicateContent: intel.duplicates.content.length,
    },
    opportunities: candidates.slice(0, MAX_OPPORTUNITIES).map((candidate) => ({
      id: `opp:${candidate.key}`,
      headline: candidate.title,
      category: candidate.category,
      priority: candidate.priority.band,
      pagesAffected: candidate.affectedCount,
      facts: candidate.facts.slice(0, 4),
      examplePages: candidate.affected.slice(0, 4).map((page) => page.path),
    })),
  };
}

/** Every id a recommendation may cite. */
export function evidenceIds(evidence: StrategyEvidence): Set<string> {
  return new Set([
    evidence.coverage.id,
    evidence.site.id,
    evidence.links.id,
    evidence.architecture.id,
    ...evidence.sections.map((section) => section.id),
    ...evidence.pages.map((page) => page.id),
    ...evidence.opportunities.map((opportunity) => opportunity.id),
  ]);
}

/** Every page path the evidence names, normalised for comparison. */
function knownPaths(intel: SiteIntelligence): Set<string> {
  const paths = new Set<string>();
  for (const page of intel.pages) paths.add(normalizePath(page.path));
  return paths;
}

function normalizePath(path: string): string {
  let value = path.trim();
  if (/^https?:\/\//i.test(value)) value = pathOf(value);
  value = value.replace(/\/+$/, "");
  return value === "" ? "/" : value.toLowerCase();
}

export function siteStrategySpec(
  intel: SiteIntelligence,
  candidates: SiteOpportunityCandidate[],
  business: BusinessBlock,
): PageFeatureSpec<SiteStrategy> {
  const evidence = { ...strategyEvidence(intel, candidates), business: business ? "provided below" : null };
  const ids = evidenceIds(evidence);
  const paths = knownPaths(intel);
  const evidenceText = JSON.stringify(evidence) + JSON.stringify(business ?? {});

  const knowledge: KnowledgeQuery = {
    checks: [...new Set(candidates.slice(0, MAX_OPPORTUNITIES).flatMap((candidate) => candidate.checks))],
    applicability: ["content_analysis", "internal_link_analysis", "site_audit", "intent_analysis", "prioritisation", "reporting_language", "myth_guard"],
    domain: "seo",
    limit: 12,
  };

  return {
    feature: "site-strategy",
    schema: siteStrategySchema,
    knowledge,
    evidence,
    maxTokens: 4000,
    temperature: 0.2,
    buildPrompt: (knowledgeBlock) => ({
      system: SITE_STRATEGY_SYSTEM_PROMPT,
      user: [
        "# EVIDENCE (from the crawl — the only facts you may use about this site)",
        JSON.stringify(evidence, null, 2),
        "",
        "# SITE AND BUSINESS CONTEXT",
        business
          ? JSON.stringify(business, null, 2)
          : "Not provided. Do not guess the business, its audience or its market; write from the crawl alone.",
        "",
        knowledgeBlock || "# KNOWLEDGE\nNone was retrieved. Say so rather than relying on memory.",
        "",
        "# TASK",
        "Write a strategy for this site with five parts:",
        "- contentOpportunities: content the site could add or improve, from the sections, page types, topics and",
        "  opportunities in the evidence. Describe new content in words; do not invent its URL.",
        "- topicStructure: how the site's topics are organised now (sections, shared topics) and clusters that",
        "  would group them better. `pages` lists existing paths only.",
        "- internalLinkStrategy: how pages should link to each other, from orphan pages, related-but-unlinked pairs,",
        "  links in and out, and generic anchors. `examplePages` lists existing paths only.",
        "- architectureRecommendations: structure, depth, sitemap coverage and page types.",
        "- contentStrategy: the focus and the few priorities that matter most, in order.",
        "Then `summary`: what the evidence says about the site overall, in three or four sentences.",
        "Set `evidenceSufficient` to false when the coverage notes say the crawl is too small, and keep",
        "recommendations to what the evidence supports (an empty list is a valid answer).",
        "Return JSON: {",
        '  "summary": string, "evidenceSufficient": boolean,',
        '  "contentOpportunities": [{ "title": string, "rationale": string, "action": string, "evidenceRefs": string[] }],',
        '  "topicStructure": { "assessment": string,',
        '    "clusters": [{ "name": string, "pages": string[], "note": string, "evidenceRefs": string[] }] },',
        '  "internalLinkStrategy": [{ "recommendation": string, "rationale": string, "examplePages": string[], "evidenceRefs": string[] }],',
        '  "architectureRecommendations": [{ "recommendation": string, "rationale": string, "evidenceRefs": string[] }],',
        '  "contentStrategy": { "focus": string,',
        '    "priorities": [{ "priority": string, "rationale": string, "evidenceRefs": string[] }] },',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ].join("\n"),
    }),
    refine: (data) => refineStrategy(data, { ids, paths, evidenceText, analyzed: intel.coverage.analyzed }),
  };
}

type Grounding = { ids: Set<string>; paths: Set<string>; evidenceText: string; analyzed: number };

/** Keeps only the refs the evidence has. Null when none are left. */
function groundRefs(refs: string[], ids: Set<string>): string[] | null {
  const kept = [...new Set(refs.map((ref) => ref.trim()))].filter((ref) => ids.has(ref));
  return kept.length > 0 ? kept : null;
}

function groundPaths(pages: string[], paths: Set<string>): string[] {
  return [...new Set(pages)].filter((page) => paths.has(normalizePath(page)));
}

function numbersOk(texts: string[], evidenceText: string): boolean {
  return texts.every((text) => ungroundedNumbers(text, evidenceText).length === 0);
}

/**
 * Drops every recommendation that is not grounded: unknown evidence ids, a
 * number the evidence lacks. Unknown page paths are removed from the lists
 * that name them. Fails only when nothing grounded is left, or when a
 * too-small crawl came back claiming the evidence was sufficient.
 */
export function refineStrategy(
  data: SiteStrategy,
  grounding: Grounding,
): { ok: true; data: SiteStrategy } | { ok: false; reason: string } {
  const { ids, paths, evidenceText } = grounding;

  const contentOpportunities = data.contentOpportunities.flatMap((row) => {
    const refs = groundRefs(row.evidenceRefs, ids);
    return refs && numbersOk([row.title, row.rationale, row.action], evidenceText) ? [{ ...row, evidenceRefs: refs }] : [];
  });
  const clusters = data.topicStructure.clusters.flatMap((row) => {
    const refs = groundRefs(row.evidenceRefs, ids);
    return refs && numbersOk([row.name, row.note], evidenceText)
      ? [{ ...row, pages: groundPaths(row.pages, paths), evidenceRefs: refs }]
      : [];
  });
  const internalLinkStrategy = data.internalLinkStrategy.flatMap((row) => {
    const refs = groundRefs(row.evidenceRefs, ids);
    return refs && numbersOk([row.recommendation, row.rationale], evidenceText)
      ? [{ ...row, examplePages: groundPaths(row.examplePages, paths), evidenceRefs: refs }]
      : [];
  });
  const architectureRecommendations = data.architectureRecommendations.flatMap((row) => {
    const refs = groundRefs(row.evidenceRefs, ids);
    return refs && numbersOk([row.recommendation, row.rationale], evidenceText) ? [{ ...row, evidenceRefs: refs }] : [];
  });
  const priorities = data.contentStrategy.priorities.flatMap((row) => {
    const refs = groundRefs(row.evidenceRefs, ids);
    return refs && numbersOk([row.priority, row.rationale], evidenceText) ? [{ ...row, evidenceRefs: refs }] : [];
  });

  const kept =
    contentOpportunities.length + clusters.length + internalLinkStrategy.length + architectureRecommendations.length + priorities.length;
  const offered =
    data.contentOpportunities.length +
    data.topicStructure.clusters.length +
    data.internalLinkStrategy.length +
    data.architectureRecommendations.length +
    data.contentStrategy.priorities.length;

  if (offered > 0 && kept === 0) {
    return { ok: false, reason: `None of the ${offered} recommendations cited evidence the crawl contains.` };
  }
  if (!numbersOk([data.summary, data.topicStructure.assessment, data.contentStrategy.focus], evidenceText)) {
    return { ok: false, reason: "The summary states numbers the evidence does not contain." };
  }

  return {
    ok: true,
    data: {
      ...data,
      // A crawl this small cannot support a site-wide strategy, whatever the model says.
      evidenceSufficient: grounding.analyzed >= MIN_PAGES_FOR_STRATEGY ? data.evidenceSufficient : false,
      contentOpportunities,
      topicStructure: { ...data.topicStructure, clusters },
      internalLinkStrategy,
      architectureRecommendations,
      contentStrategy: { ...data.contentStrategy, priorities },
    },
  };
}
