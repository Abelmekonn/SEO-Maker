/**
 * Search evidence: what checked search results say about one competitor.
 *
 * Observed only. Positions are the ones a search provider returned for a
 * query in your market; nothing is estimated, and search volume is never
 * assumed. A query whose results were not fetched is left out entirely,
 * rather than read as "the competitor was not there".
 */

import type { ConfidenceSearchEvidence } from "../scoring/confidence";
import { containment, termSet } from "../site/terms";
import { hostKey } from "./domain";
import { COUNTRIES } from "./market";

export type SearchResultRow = {
  position: number;
  domain: string;
  url: string;
  title?: string | null;
};

export type CheckedQuery = {
  id: string;
  query: string;
  intent: string | null;
  /** 0..1 relevance to your business, or null when there is no business to compare with. */
  relevance: number | null;
  /** False when its results were never fetched: then it is not evidence of anything. */
  checked: boolean;
  /** Your site's best position, when it appears. */
  selfPosition: number | null;
  results: SearchResultRow[];
};

export type SearchEvidenceRow = {
  queryId: string;
  query: string;
  intent: string | null;
  relevance: number | null;
  position: number;
  url: string;
  selfPosition: number | null;
};

export type SearchEvidenceSummary = ConfidenceSearchEvidence & {
  /** Share of the checked searches it appears in, 0..1. */
  appearanceRate: number;
  /** Share of the checked searches you both appear in, 0..1. */
  sharedQueryRate: number;
  /** One row per search it appears in, best position first. */
  rows: SearchEvidenceRow[];
};

/** Whether a result belongs to a competitor: the same site, or one of its subdomains. */
export function resultMatchesDomain(resultDomain: string, competitorDomain: string): boolean {
  const result = hostKey(resultDomain);
  const competitor = hostKey(competitorDomain);
  if (!result || !competitor) return false;
  return result === competitor || result.endsWith(`.${competitor}`);
}

/**
 * Aggregates checked searches for one competitor.
 *
 * "Shared" means both of you appear in the same search. The confidence
 * signal counts every checked search the competitor appears in: the
 * searches are yours (generated from your business), so a competitor in
 * them competes for your customers whether or not your site ranks yet.
 */
export function summarizeSearchEvidence(queries: CheckedQuery[], competitorDomain: string): SearchEvidenceSummary {
  const checked = queries.filter((query) => query.checked);
  const rows: SearchEvidenceRow[] = [];
  let sharedQueryCount = 0;
  let selfAppearanceCount = 0;

  for (const query of checked) {
    const theirs = query.results
      .filter((result) => resultMatchesDomain(result.domain, competitorDomain))
      .sort((a, b) => a.position - b.position)[0];
    const selfAppears = query.selfPosition != null;
    if (selfAppears) selfAppearanceCount += 1;
    if (!theirs) continue;
    if (selfAppears) sharedQueryCount += 1;
    rows.push({
      queryId: query.id,
      query: query.query,
      intent: query.intent,
      relevance: query.relevance,
      position: theirs.position,
      url: theirs.url,
      selfPosition: query.selfPosition,
    });
  }
  rows.sort((a, b) => a.position - b.position || a.query.localeCompare(b.query));

  const positions = rows.map((row) => row.position);
  const relevances = rows.map((row) => row.relevance).filter((value): value is number => value != null);
  const total = checked.length;
  return {
    queriesChecked: total,
    appearanceCount: rows.length,
    sharedQueryCount,
    selfAppearanceCount,
    positions,
    top3: positions.filter((position) => position <= 3).length,
    top10: positions.filter((position) => position <= 10).length,
    top20: positions.filter((position) => position <= 20).length,
    bestPosition: positions.length ? Math.min(...positions) : null,
    avgPosition: positions.length ? positions.reduce((sum, value) => sum + value, 0) / positions.length : null,
    meanRelevance: relevances.length ? relevances.reduce((sum, value) => sum + value, 0) / relevances.length : null,
    appearanceRate: total ? rows.length / total : 0,
    sharedQueryRate: total ? sharedQueryCount / total : 0,
    rows,
  };
}

/** Country names are where a search is made, not what it is about. */
const LOCATION_TERMS = termSet(...COUNTRIES.flatMap((country) => [country.name, ...country.aliases]));

/**
 * Relevance of one search to the business, 0..1: the share of the search's
 * topic words your business context or site uses, saturating at half (a
 * search rarely repeats a business's own vocabulary word for word).
 * Location words are ignored. Null when there is nothing to compare with.
 */
export function scoreQueryRelevance(query: string, businessTerms: ReadonlySet<string>): number | null {
  if (businessTerms.size === 0) return null;
  const words = new Set([...termSet(query)].filter((word) => !LOCATION_TERMS.has(word)));
  if (words.size === 0) return null;
  return Math.round(Math.min(1, containment(words, businessTerms) / 0.5) * 100) / 100;
}
