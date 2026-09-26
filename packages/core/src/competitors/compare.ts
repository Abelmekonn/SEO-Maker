/**
 * Competitor comparison (Phase 4.1, 4.2).
 *
 * The factual half of competitive intelligence. Everything here is observed in
 * the two crawls (and in search results, when a provider supplied them), and
 * each observation is a fact with a stable id. The AI layer interprets facts
 * by id and cannot add one, which is how the product keeps "what we saw"
 * separate from "what we think it means".
 *
 * Nothing here says a gap should be closed. A competitor having a page does
 * not prove your site needs one; that judgement needs the business context,
 * which is why relevance stays null (and unweighted) without it.
 */

import { type OpportunityResult, opportunityScore } from "../scoring/opportunity";
import type { SiteIntelligence, SitePage } from "../site/intelligence";
import { containment, overlap, termSet, titleTopic } from "../site/terms";

export type CompetitorPageInput = {
  url: string;
  title: string | null;
  h1: string | null;
  wordCount: number | null;
  internalLinks: number | null;
  pageType: string | null;
  schemaTypes: string[];
  headings: string[];
};

/** A search where the competitor appeared, from SERP data. Empty without a provider. */
export type SerpEvidence = {
  query: string;
  competitorPosition: number;
  selfPosition: number | null;
  searchVolume: number | null;
};

export type FactKind = "page-type" | "structured-data" | "topic" | "depth" | "internal-links" | "keyword";

export type CompetitorFact = {
  id: string;
  kind: FactKind;
  /** Which side the observation favours. Observed, not judged. */
  favours: "competitor" | "self";
  statement: string;
  /** Competitor URLs that evidence it. */
  urls: string[];
  /** Your URLs that evidence it. */
  selfUrls: string[];
};

export type TopicGap = {
  factId: string;
  topic: string;
  terms: string[];
  url: string;
  pageType: string | null;
  wordCount: number | null;
  /** Your page that comes closest, and the share of the topic's words it covers. */
  bestSelfMatch: { url: string; score: number } | null;
};

export type CompetitorComparison = {
  domain: string;
  pagesCompared: { self: number; competitor: number };
  pageTypes: Array<{ type: string; self: number; competitor: number }>;
  schemaTypes: Array<{ type: string; self: number; competitor: number }>;
  topicGaps: TopicGap[];
  depth: Array<{ pageType: string; selfAvgWords: number; competitorAvgWords: number; selfPages: number; competitorPages: number }>;
  internalLinks: { selfAvg: number | null; competitorAvg: number | null };
  keywordGaps: SerpEvidence[];
  facts: CompetitorFact[];
  /** What the comparison could not establish, stated rather than hidden. */
  limits: string[];
};

/** Page types that describe the site, not a topic someone searches for. */
const NON_TOPIC_TYPES = new Set(["homepage", "legal", "contact", "about"]);
/** Covered when your best page states this share of the topic's words. */
const TOPIC_COVERED = 0.5;
const MAX_TOPIC_GAPS = 20;
/** A difference this large is worth stating; smaller ones are noise between two samples. */
const NOTABLE_RATIO = 1.5;

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function pathWords(url: string): string {
  try {
    return new URL(url).pathname.replace(/[/_.-]+/g, " ");
  } catch {
    return "";
  }
}

function selfTopicTerms(page: SitePage): Set<string> {
  return termSet(titleTopic(page.title), page.h1, page.headings.join(" "), pathWords(page.url));
}

function countBy<T>(items: T[], key: (item: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function compareWithCompetitor(input: {
  domain: string;
  self: SiteIntelligence;
  competitorPages: CompetitorPageInput[];
  serp?: SerpEvidence[];
}): CompetitorComparison {
  const selfPages = input.self.pages.filter((page) => page.indexable !== false);
  const theirs = input.competitorPages;
  const facts: CompetitorFact[] = [];

  // ---- page types
  const selfTypes = countBy(selfPages, (page) => page.pageType);
  const theirTypes = countBy(theirs, (page) => page.pageType);
  const typeRows = [...new Set([...selfTypes.keys(), ...theirTypes.keys()])]
    .filter((type) => type !== "other" && type !== "legal")
    .map((type) => ({ type, self: selfTypes.get(type) ?? 0, competitor: theirTypes.get(type) ?? 0 }))
    .sort((a, b) => b.competitor + b.self - (a.competitor + a.self) || a.type.localeCompare(b.type));
  for (const row of typeRows) {
    if (row.competitor > 0 && row.self === 0 && !NON_TOPIC_TYPES.has(row.type)) {
      facts.push({
        id: `pt:${row.type}`,
        kind: "page-type",
        favours: "competitor",
        statement: `${input.domain} has ${plural(row.competitor, `${row.type} page`)}; none of your crawled pages is classified as ${row.type}.`,
        urls: theirs.filter((page) => page.pageType === row.type).slice(0, 3).map((page) => page.url),
        selfUrls: [],
      });
    }
  }

  // ---- structured data
  const selfSchema = new Map(Object.entries(input.self.schema.byType));
  const theirSchema = new Map<string, number>();
  for (const page of theirs) for (const type of new Set(page.schemaTypes)) theirSchema.set(type, (theirSchema.get(type) ?? 0) + 1);
  const schemaRows = [...new Set([...selfSchema.keys(), ...theirSchema.keys()])]
    .map((type) => ({ type, self: selfSchema.get(type) ?? 0, competitor: theirSchema.get(type) ?? 0 }))
    .sort((a, b) => b.competitor + b.self - (a.competitor + a.self) || a.type.localeCompare(b.type));
  for (const row of schemaRows.filter((item) => item.competitor > 0 && item.self === 0).slice(0, 8)) {
    facts.push({
      id: `sd:${row.type}`,
      kind: "structured-data",
      favours: "competitor",
      statement: `${input.domain} marks up ${plural(row.competitor, "page")} as schema.org ${row.type}; none of yours uses ${row.type}.`,
      urls: theirs.filter((page) => page.schemaTypes.includes(row.type)).slice(0, 3).map((page) => page.url),
      selfUrls: [],
    });
  }
  for (const row of schemaRows.filter((item) => item.self > 0 && item.competitor === 0).slice(0, 4)) {
    facts.push({
      id: `sd-self:${row.type}`,
      kind: "structured-data",
      favours: "self",
      statement: `You mark up ${plural(row.self, "page")} as schema.org ${row.type}; ${input.domain} does not on any crawled page.`,
      urls: [],
      selfUrls: selfPages.filter((page) => page.schemaTypes.includes(row.type)).slice(0, 3).map((page) => page.url),
    });
  }

  // ---- topics
  const selfTerms = selfPages.map((page) => ({ page, terms: selfTopicTerms(page) }));
  const topicGaps: TopicGap[] = [];
  const seenTopics: Array<Set<string>> = [];
  const byWords = [...theirs].sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0));
  for (const page of byWords) {
    if (topicGaps.length >= MAX_TOPIC_GAPS) break;
    if (page.pageType && NON_TOPIC_TYPES.has(page.pageType)) continue;
    const topic = (page.h1 || titleTopic(page.title) || "").trim();
    const terms = termSet(topic, titleTopic(page.title));
    if (!topic || terms.size === 0) continue;
    if (seenTopics.some((seen) => overlap(seen, terms) >= 0.6)) continue;

    let best: { url: string; score: number } | null = null;
    for (const row of selfTerms) {
      const score = containment(terms, row.terms);
      if (!best || score > best.score) best = { url: row.page.url, score };
    }
    if (best && best.score >= TOPIC_COVERED) continue;

    seenTopics.push(terms);
    const factId = `topic:${topicGaps.length + 1}`;
    topicGaps.push({
      factId,
      topic: topic.slice(0, 160),
      terms: [...terms].slice(0, 8),
      url: page.url,
      pageType: page.pageType,
      wordCount: page.wordCount,
      bestSelfMatch: best && best.score > 0 ? { url: best.url, score: Math.round(best.score * 100) / 100 } : null,
    });
    facts.push({
      id: factId,
      kind: "topic",
      favours: "competitor",
      statement:
        `${input.domain} has a page about "${topic.slice(0, 120)}"` +
        (page.wordCount ? ` (${page.wordCount} words)` : "") +
        (best && best.score > 0
          ? `; your closest page names ${Math.round(best.score * 100)}% of its topic words.`
          : "; none of your crawled pages names its topic words."),
      urls: [page.url],
      selfUrls: best && best.score > 0 ? [best.url] : [],
    });
  }

  // ---- depth by shared page type
  const depth: CompetitorComparison["depth"] = [];
  for (const row of typeRows.filter((item) => item.self > 0 && item.competitor > 0)) {
    const selfAvg = average(selfPages.filter((page) => page.pageType === row.type && page.wordCount != null).map((page) => page.wordCount!));
    const theirAvg = average(theirs.filter((page) => page.pageType === row.type && page.wordCount != null).map((page) => page.wordCount!));
    if (selfAvg == null || theirAvg == null) continue;
    depth.push({ pageType: row.type, selfAvgWords: selfAvg, competitorAvgWords: theirAvg, selfPages: row.self, competitorPages: row.competitor });
    if (theirAvg >= selfAvg * NOTABLE_RATIO || selfAvg >= theirAvg * NOTABLE_RATIO) {
      const competitorAhead = theirAvg > selfAvg;
      facts.push({
        id: `depth:${row.type}`,
        kind: "depth",
        favours: competitorAhead ? "competitor" : "self",
        statement: `${input.domain}'s ${row.type} pages average ${theirAvg} words across ${row.competitor}; yours average ${selfAvg} across ${row.self}.`,
        urls: [],
        selfUrls: [],
      });
    }
  }

  // ---- internal links
  const selfLinks = average(selfPages.map((page) => page.internalLinks).filter((value): value is number => value != null));
  const theirLinks = average(theirs.map((page) => page.internalLinks).filter((value): value is number => value != null));
  if (selfLinks != null && theirLinks != null && (theirLinks >= selfLinks * NOTABLE_RATIO || selfLinks >= theirLinks * NOTABLE_RATIO)) {
    facts.push({
      id: "links:avg",
      kind: "internal-links",
      favours: theirLinks > selfLinks ? "competitor" : "self",
      statement: `${input.domain}'s pages carry ${theirLinks} internal links on average; yours carry ${selfLinks}.`,
      urls: [],
      selfUrls: [],
    });
  }

  // ---- keywords, only from real search results
  const keywordGaps = (input.serp ?? [])
    .filter((row) => row.competitorPosition <= 10 && (row.selfPosition == null || row.selfPosition > 20))
    .sort((a, b) => a.competitorPosition - b.competitorPosition || (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, 10);
  keywordGaps.forEach((row, index) => {
    facts.push({
      id: `kw:${index + 1}`,
      kind: "keyword",
      favours: "competitor",
      statement: `${input.domain} ranks #${row.competitorPosition} for "${row.query}"; ${row.selfPosition == null ? "you were not found in the results checked" : `you rank #${row.selfPosition}`}.`,
      urls: [],
      selfUrls: [],
    });
  });

  const limits: string[] = [];
  if (!input.serp || input.serp.length === 0) {
    limits.push("No search results data was available, so rankings and keyword gaps are not compared.");
  }
  limits.push(
    `Based on ${plural(theirs.length, "competitor page")} and ${plural(selfPages.length, "of your pages")}; pages beyond either crawl are not compared.`,
  );
  limits.push("Topics are compared by the words in titles and headings, which cannot tell whether two pages answer the same question.");

  return {
    domain: input.domain,
    pagesCompared: { self: selfPages.length, competitor: theirs.length },
    pageTypes: typeRows,
    schemaTypes: schemaRows,
    topicGaps,
    depth,
    internalLinks: { selfAvg: selfLinks, competitorAvg: theirLinks },
    keywordGaps,
    facts,
    limits,
  };
}

// ------------------------------------------------------------------ gaps across competitors

export type GapKind = "topic" | "keyword" | "page-type" | "schema" | "depth";

export type AggregatedGap = {
  /** Stable identity for upserts: kind plus the normalized subject. */
  key: string;
  kind: GapKind;
  title: string;
  detail: string;
  competitorIds: string[];
  bestCompetitorUrl: string | null;
  avgCompetitorWordCount: number | null;
  selfUrl: string | null;
  selfWordCount: number | null;
  /** 0..1 share of the topic your closest page covers. */
  selfCoverage: number;
  query: string | null;
  searchVolume: number | null;
  pageType: string | null;
  /** 0..1 relevance to the stated business, or null in Quick mode. */
  relevance: number | null;
  businessValue: number | null;
  opportunity: OpportunityResult;
};

export type BusinessTerms = {
  offerings: string[];
  targetKeywords: string[];
  description: string | null;
  audience: string | null;
  industry: string | null;
};

/** Page types a business usually wants found in search, as a 0..1 value. */
const PAGE_TYPE_VALUE: Record<string, number> = {
  product: 0.8,
  service: 0.8,
  pricing: 0.8,
  landing: 0.7,
  category: 0.6,
  article: 0.5,
  documentation: 0.5,
};

function businessTermSet(business: BusinessTerms | null): Set<string> | null {
  if (!business) return null;
  const set = termSet(
    business.offerings.join(" "),
    business.targetKeywords.join(" "),
    business.description,
    business.audience,
    business.industry,
  );
  return set.size ? set : null;
}

type GapDraft = Omit<AggregatedGap, "competitorIds" | "opportunity" | "relevance" | "businessValue"> & {
  competitorIds: Set<string>;
  terms: Set<string>;
  wordCounts: number[];
};

/**
 * Merges each competitor's gaps into one list, scores each with the
 * Opportunity Score, and ranks them. A gap many competitors share, on a topic
 * the business says it cares about, that you do not cover, ranks first.
 */
export function aggregateContentGaps(input: {
  comparisons: Array<{ competitorId: string; comparison: CompetitorComparison }>;
  self: SiteIntelligence;
  business: BusinessTerms | null;
}): AggregatedGap[] {
  const drafts = new Map<string, GapDraft>();
  const businessTerms = businessTermSet(input.business);
  const selfWords = new Map(input.self.pages.map((page) => [page.url, page.wordCount]));

  const merge = (key: string, draft: Omit<GapDraft, "competitorIds" | "wordCounts">, competitorId: string, words: number | null) => {
    const existing = drafts.get(key) ?? { ...draft, competitorIds: new Set<string>(), wordCounts: [] };
    existing.competitorIds.add(competitorId);
    if (words != null) existing.wordCounts.push(words);
    if (draft.selfCoverage > existing.selfCoverage) {
      existing.selfCoverage = draft.selfCoverage;
      existing.selfUrl = draft.selfUrl;
      existing.selfWordCount = draft.selfWordCount;
    }
    drafts.set(key, existing);
  };

  for (const { competitorId, comparison } of input.comparisons) {
    for (const gap of comparison.topicGaps) {
      // Near-identical topics from different competitors are one gap.
      const terms = new Set(gap.terms);
      const match = [...drafts.entries()].find(([, draft]) => draft.kind === "topic" && overlap(draft.terms, terms) >= 0.6);
      const key = match?.[0] ?? `topic:${[...terms].sort().join("-").slice(0, 120)}`;
      merge(
        key,
        {
          key,
          kind: "topic",
          title: gap.topic,
          detail: `Competitor page: ${gap.url}`,
          bestCompetitorUrl: gap.url,
          avgCompetitorWordCount: null,
          selfUrl: gap.bestSelfMatch?.url ?? null,
          selfWordCount: gap.bestSelfMatch ? (selfWords.get(gap.bestSelfMatch.url) ?? null) : null,
          selfCoverage: gap.bestSelfMatch?.score ?? 0,
          query: null,
          searchVolume: null,
          pageType: gap.pageType,
          terms,
        },
        competitorId,
        gap.wordCount,
      );
    }
    for (const fact of comparison.facts) {
      if (fact.favours !== "competitor") continue;
      if (fact.kind === "page-type" || fact.kind === "structured-data" || fact.kind === "depth") {
        const subject = fact.id.split(":").slice(1).join(":");
        const kind: GapKind = fact.kind === "structured-data" ? "schema" : fact.kind;
        const key = `${kind}:${subject.toLowerCase()}`;
        const depthRow = fact.kind === "depth" ? comparison.depth.find((row) => row.pageType === subject) : undefined;
        merge(
          key,
          {
            key,
            kind,
            title:
              kind === "page-type"
                ? `${subject} pages`
                : kind === "schema"
                  ? `schema.org ${subject} markup`
                  : `Depth of ${subject} pages`,
            detail: fact.statement,
            bestCompetitorUrl: fact.urls[0] ?? null,
            avgCompetitorWordCount: depthRow?.competitorAvgWords ?? null,
            selfUrl: null,
            selfWordCount: depthRow?.selfAvgWords ?? null,
            // A depth gap is partial coverage by definition: the page type exists.
            selfCoverage: depthRow ? Math.min(1, depthRow.selfAvgWords / Math.max(1, depthRow.competitorAvgWords)) : 0,
            query: null,
            searchVolume: null,
            pageType: kind === "page-type" || kind === "depth" ? subject : null,
            terms: termSet(subject),
          },
          competitorId,
          depthRow?.competitorAvgWords ?? null,
        );
      }
    }
    for (const row of comparison.keywordGaps) {
      const key = `keyword:${row.query.toLowerCase().trim()}`;
      merge(
        key,
        {
          key,
          kind: "keyword",
          title: row.query,
          detail: `Competitor ranks #${row.competitorPosition}; ${row.selfPosition == null ? "you are not in the results checked" : `you rank #${row.selfPosition}`}.`,
          bestCompetitorUrl: null,
          avgCompetitorWordCount: null,
          selfUrl: null,
          selfWordCount: null,
          selfCoverage: row.selfPosition == null ? 0 : 0.3,
          query: row.query,
          searchVolume: row.searchVolume,
          pageType: null,
          terms: termSet(row.query),
        },
        competitorId,
        null,
      );
    }
  }

  const competitorsTotal = input.comparisons.length;
  return [...drafts.values()]
    .map(({ competitorIds, terms, wordCounts, ...draft }) => {
      const relevance = businessTerms ? Math.round(containment(terms, businessTerms) * 100) / 100 : null;
      const businessValue = draft.pageType ? (PAGE_TYPE_VALUE[draft.pageType] ?? 0.3) : null;
      const avgWords = draft.avgCompetitorWordCount ?? average(wordCounts);
      return {
        ...draft,
        avgCompetitorWordCount: avgWords,
        competitorIds: [...competitorIds],
        relevance,
        businessValue,
        opportunity: opportunityScore({
          relevance,
          competitorsCovering: competitorIds.size,
          competitorsTotal,
          selfCoverage: draft.selfCoverage,
          searchVolume: draft.searchVolume,
          difficulty: null,
          businessValue,
        }),
      };
    })
    .sort(
      (a, b) =>
        (b.opportunity.score ?? 0) - (a.opportunity.score ?? 0) ||
        b.competitorIds.length - a.competitorIds.length ||
        a.key.localeCompare(b.key),
    );
}
