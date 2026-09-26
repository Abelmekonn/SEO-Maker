/**
 * Competitor comparisons and content gaps (Phase 4.1, 4.2).
 *
 * Deterministic: builds each tracked competitor's comparison with your site
 * from the two crawls (and SERP rows, when a provider supplied any), stores it
 * on the competitor's latest analysis, and turns the gaps shared across
 * competitors into ContentGap rows and scored opportunities. No model is
 * called; the AI job interprets what this stores.
 */

import {
  type AggregatedGap,
  type CompetitorComparison,
  type CompetitorPageInput,
  type SerpEvidence,
  aggregateContentGaps,
  compareWithCompetitor,
  registrableDomain,
  resultMatchesDomain,
} from "@seo-maker/core/competitors";
import { Prisma, prisma } from "@seo-maker/db";
import { type LoadedSite, loadSiteIntelligence } from "../context/site";

/** Gaps below this Opportunity Score stay as evidence but are not proposed as work. */
const MIN_OPPORTUNITY_SCORE = 35;
const MAX_COMPETITOR_OPPORTUNITIES = 25;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export type CompetitorComparisonRow = {
  competitorId: string;
  domain: string;
  comparison: CompetitorComparison;
};

/** Builds the comparison for one competitor from what is stored. */
export async function buildCompetitorComparison(
  competitor: { id: string; domain: string; projectId: string },
  loaded: LoadedSite,
): Promise<CompetitorComparison> {
  const [pages, serp] = await Promise.all([
    prisma.competitorPage.findMany({
      where: { competitorId: competitor.id, status: "analyzed" },
      select: { url: true, title: true, h1: true, wordCount: true, internalLinks: true, pageType: true, schema: true, headings: true },
    }),
    prisma.serpResult.findMany({
      where: {
        domain: { in: [...new Set([competitor.domain, registrableDomain(competitor.domain)])] },
        query: { projectId: competitor.projectId, status: { not: "retired" } },
      },
      select: { position: true, url: true, query: { select: { query: true, selfPosition: true, searchVolume: true } } },
      orderBy: { position: "asc" },
    }),
  ]).then(([pages, rows]) => [pages, rows.filter((row) => resultMatchesDomain(hostOf(row.url), competitor.domain))] as const);

  const competitorPages: CompetitorPageInput[] = pages.map((page) => ({
    url: page.url,
    title: page.title,
    h1: page.h1,
    wordCount: page.wordCount,
    internalLinks: page.internalLinks,
    pageType: page.pageType,
    schemaTypes: strings(page.schema),
    headings: strings(page.headings),
  }));

  // Best position per query: a domain can hold several results for one search.
  const bestByQuery = new Map<string, SerpEvidence>();
  for (const row of serp) {
    if (bestByQuery.has(row.query.query)) continue;
    bestByQuery.set(row.query.query, {
      query: row.query.query,
      competitorPosition: row.position,
      selfPosition: row.query.selfPosition,
      searchVolume: row.query.searchVolume,
    });
  }

  return compareWithCompetitor({
    domain: competitor.domain,
    self: loaded.intel,
    competitorPages,
    serp: [...bestByQuery.values()],
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Stores a comparison on the competitor's latest analysis row. */
export async function saveComparison(competitorId: string, comparison: CompetitorComparison): Promise<void> {
  const latest = await prisma.competitorAnalysis.findFirst({
    where: { competitorId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latest) return;
  await prisma.competitorAnalysis.update({
    where: { id: latest.id },
    data: { comparison: comparison as unknown as Prisma.InputJsonValue },
  });
}

const GAP_CATEGORY: Record<AggregatedGap["kind"], string> = {
  topic: "content",
  keyword: "content",
  "page-type": "content",
  depth: "content",
  schema: "structured-data",
};

const GAP_EFFORT: Record<AggregatedGap["kind"], string> = {
  topic: "high",
  keyword: "high",
  "page-type": "high",
  depth: "medium",
  schema: "medium",
};

function gapWording(gap: AggregatedGap, competitorsTotal: number) {
  const subject = gap.pageType ?? gap.title;
  const title = {
    topic: `Consider covering "${gap.title}"`,
    keyword: `Compete for "${gap.title}"`,
    "page-type": `Consider adding ${subject} pages`,
    depth: `Deepen your ${subject} pages`,
    schema: `Consider ${gap.title} where it fits`,
  }[gap.kind];
  const covered = `${gap.competitorIds.length} of ${competitorsTotal} analysed competitors ${gap.competitorIds.length === 1 ? "has" : "have"} this and your site does not${gap.selfCoverage > 0 ? " fully" : ""}.`;
  const fit =
    gap.relevance == null
      ? "Whether it fits your business is not established: add business context (Deep mode) to score relevance."
      : gap.relevance >= 0.5
        ? "It matches what your business context says you offer."
        : "It does not clearly match your business context.";
  const action = {
    topic: "Check whether your audience searches for this. If it fits what you offer, cover it on an existing page or a new one.",
    keyword: "Find the page that should answer this search, and make its title, H1 and content address it directly.",
    "page-type": "Decide whether this kind of page serves your visitors. If it does, create one from your own offering, not a copy.",
    depth: "Review what these pages leave unanswered compared with theirs, and add what your visitors need. Length is not the goal.",
    schema: "Add this markup only to pages whose content genuinely matches the schema.org type.",
  }[gap.kind];
  return {
    title,
    covered,
    rationale: `${covered} ${fit} A competitor having something does not prove your site needs it.`,
    action,
  };
}

export type CompetitorSync = {
  comparisons: CompetitorComparisonRow[];
  gaps: number;
  opportunities: number;
};

/**
 * Rebuilds every ready competitor's comparison and the project's gaps.
 * Null when the project has no complete crawl of its own to compare with.
 */
export async function syncCompetitorGaps(projectId: string, loadedSite?: LoadedSite): Promise<CompetitorSync | null> {
  const loaded = loadedSite ?? (await loadSiteIntelligence(projectId));
  if (!loaded) return null;

  const competitors = await prisma.competitor.findMany({
    where: { projectId, excluded: false, status: "ready" },
    select: { id: true, domain: true, projectId: true },
  });
  const comparisons: CompetitorComparisonRow[] = [];
  for (const competitor of competitors) {
    const comparison = await buildCompetitorComparison(competitor, loaded);
    await saveComparison(competitor.id, comparison);
    comparisons.push({ competitorId: competitor.id, domain: competitor.domain, comparison });
  }

  const gaps = aggregateContentGaps({
    comparisons,
    self: loaded.intel,
    business: loaded.businessTerms,
  });

  const existing = await prisma.contentGap.findMany({ where: { projectId }, select: { id: true, key: true, status: true } });
  const byKey = new Map(existing.flatMap((row) => (row.key ? [[row.key, row]] : [])));
  const kept = new Set<string>();
  const proposed = new Set<string>();

  for (const gap of gaps) {
    kept.add(gap.key);
    const data = {
      kind: gap.kind,
      title: gap.title.slice(0, 300),
      detail: gap.detail.slice(0, 1000),
      query: gap.query,
      selfUrl: gap.selfUrl,
      selfWordCount: gap.selfWordCount,
      competitorCount: gap.competitorIds.length,
      competitorIds: gap.competitorIds,
      avgCompetitorWordCount: gap.avgCompetitorWordCount,
      bestCompetitorUrl: gap.bestCompetitorUrl,
      searchVolume: gap.searchVolume,
      relevance: gap.relevance,
      businessValue: gap.businessValue,
    };
    const row = byKey.get(gap.key);
    const saved = row
      ? await prisma.contentGap.update({ where: { id: row.id }, data, select: { id: true } })
      : await prisma.contentGap.create({ data: { projectId, key: gap.key, ...data }, select: { id: true } });

    const score = gap.opportunity.score;
    if (score == null || score < MIN_OPPORTUNITY_SCORE || proposed.size >= MAX_COMPETITOR_OPPORTUNITIES) continue;
    const key = `gap:${gap.key}`;
    proposed.add(key);
    const { covered, ...wording } = gapWording(gap, comparisons.length);
    const facts = [gap.detail, covered];
    const opportunity = {
      source: "competitor",
      gapId: saved.id,
      competitorId: gap.competitorIds[0] ?? null,
      category: GAP_CATEGORY[gap.kind],
      score,
      band: gap.opportunity.band ?? "low",
      parts: {
        parts: gap.opportunity.parts,
        weights: gap.opportunity.weights,
        notMeasured: gap.opportunity.notMeasured,
      } as unknown as Prisma.InputJsonValue,
      effort: GAP_EFFORT[gap.kind],
      // Word overlap and page types are evidence of a gap, not proof of one.
      confidence: gap.kind === "keyword" ? 0.8 : 0.6,
      evidence: { facts, factsHash: gap.key, checks: [] } as unknown as Prisma.InputJsonValue,
      affectedUrls: (gap.selfUrl ? [{ key: gap.selfUrl, url: gap.selfUrl, path: gap.selfUrl }] : []) as unknown as Prisma.InputJsonValue,
      affectedCount: gap.competitorIds.length,
      crawlId: loaded.crawlId,
      resolvedAt: null,
      ...wording,
    };
    await prisma.opportunity.upsert({
      where: { projectId_key: { projectId, key } },
      create: {
        projectId,
        key,
        ...opportunity,
        baselineCount: gap.competitorIds.length,
        baselineCrawlId: loaded.crawlId,
      },
      update: opportunity,
    });
  }

  // A gap no competitor shows any more, and nobody acted on, is simply gone.
  // Its opportunity goes with it (ContentGap -> Opportunity cascades).
  const stale = existing.filter((row) => row.key && !kept.has(row.key) && row.status === "open");
  if (stale.length > 0) {
    await prisma.contentGap.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }
  // Opportunities for gaps still recorded but no longer proposed.
  await prisma.opportunity.deleteMany({
    where: { projectId, source: "competitor", status: "open", key: { notIn: [...proposed] } },
  });

  return { comparisons, gaps: gaps.length, opportunities: proposed.size };
}
