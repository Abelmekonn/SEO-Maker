/**
 * Automatic discovery: which domain competes hardest in your searches.
 *
 * Every domain in the checked results is aggregated across all searches, not
 * picked from the first result of the first one. The strength of a
 * candidate is observed search competition evidence: how many of your
 * searches it appears in and how high, weighted by how relevant each search
 * is to your business. It is not a ranking assessment of the site.
 */

import { positionVisibility } from "../scoring/confidence";
import { discoveryExclusion, hostKey, registrableDomain } from "./domain";

export type CandidateQuery = {
  id: string;
  query: string;
  /** 0..1, or null when unknown (then every search counts the same). */
  relevance: number | null;
};

export type CandidateResult = {
  queryId: string;
  position: number;
  /** Host or domain as the provider reported it. */
  domain: string;
  url: string;
};

export type Candidate = {
  domain: string;
  appearances: number;
  queriesChecked: number;
  /** appearances / queriesChecked. */
  coverage: number;
  top3: number;
  top10: number;
  top20: number;
  bestPosition: number;
  avgPosition: number;
  /** Relevance-weighted visibility across every checked search, 0..1. */
  visibility: number;
  /** Mean relevance of the searches it appears in, or null. */
  relevance: number | null;
  /** 0-100. See `aggregateCandidates`. */
  strength: number;
  /** Whether it recurs often enough to be selected. */
  eligible: boolean;
  searches: Array<{ queryId: string; query: string; position: number; url: string }>;
};

export type ExcludedCandidate = { domain: string; reason: string; appearances: number };

export type CandidateAggregation = {
  queriesChecked: number;
  /** Eligible first, strongest first. */
  candidates: Candidate[];
  excluded: ExcludedCandidate[];
  minAppearances: number;
};

/**
 * A domain has to recur to count: with four or more searches checked it
 * must appear in at least two, so one stray result for one loosely related
 * search can never become your competitor.
 */
export function minimumAppearances(queriesChecked: number): number {
  return queriesChecked >= 4 ? 2 : 1;
}

/**
 * Groups results by registrable domain and scores each:
 *
 *   coverage   = searches it appears in / searches checked
 *   visibility = Σ r(q) · positionVisibility(best position in q) / Σ r(q)
 *                over every checked search (0 where it is absent),
 *                r(q) = the search's relevance, 1 when unknown
 *   strength   = round(100 · (0.5 · coverage + 0.5 · visibility))
 *
 * Your own domain, domains you removed, and search engines, social
 * networks, directories, review sites, marketplaces and general publishers
 * (see `discoveryExclusion`) are set aside with the reason.
 */
export function aggregateCandidates(input: {
  queries: CandidateQuery[];
  results: CandidateResult[];
  selfDomain: string;
  /** Competitors the user removed: never proposed again. */
  excludedDomains?: Iterable<string>;
}): CandidateAggregation {
  const queries = new Map(input.queries.map((query) => [query.id, query]));
  const queriesChecked = queries.size;
  // A domain or the site's root URL.
  const self = registrableDomain(safeHost(input.selfDomain) || input.selfDomain);
  const removed = new Set([...(input.excludedDomains ?? [])].map((domain) => hostKey(domain)));
  const minAppearances = minimumAppearances(queriesChecked);
  const weightOf = (queryId: string) => queries.get(queryId)?.relevance ?? 1;
  const totalWeight = [...queries.keys()].reduce((sum, id) => sum + weightOf(id), 0);

  // Best position per domain per search.
  const best = new Map<string, Map<string, CandidateResult>>();
  for (const result of input.results) {
    if (!queries.has(result.queryId) || !(result.position > 0)) continue;
    const domain = registrableDomain(result.domain || safeHost(result.url));
    if (!domain) continue;
    const byQuery = best.get(domain) ?? new Map<string, CandidateResult>();
    const current = byQuery.get(result.queryId);
    if (!current || result.position < current.position) byQuery.set(result.queryId, result);
    best.set(domain, byQuery);
  }

  const candidates: Candidate[] = [];
  const excluded: ExcludedCandidate[] = [];
  for (const [domain, byQuery] of best) {
    const appearances = byQuery.size;
    const reason =
      domain === self
        ? "Your own site"
        : removed.has(domain)
          ? "You removed this competitor"
          : discoveryExclusion(domain);
    if (reason) {
      excluded.push({ domain, reason, appearances });
      continue;
    }

    const searches = [...byQuery.values()]
      .map((result) => ({ queryId: result.queryId, query: queries.get(result.queryId)!.query, position: result.position, url: result.url }))
      .sort((a, b) => a.position - b.position || a.query.localeCompare(b.query));
    const positions = searches.map((search) => search.position);
    const visibility = totalWeight > 0 ? searches.reduce((sum, search) => sum + weightOf(search.queryId) * positionVisibility(search.position), 0) / totalWeight : 0;
    const coverage = queriesChecked ? appearances / queriesChecked : 0;
    const relevances = searches.map((search) => queries.get(search.queryId)!.relevance).filter((value): value is number => value != null);
    candidates.push({
      domain,
      appearances,
      queriesChecked,
      coverage: round(coverage),
      top3: positions.filter((position) => position <= 3).length,
      top10: positions.filter((position) => position <= 10).length,
      top20: positions.filter((position) => position <= 20).length,
      bestPosition: Math.min(...positions),
      avgPosition: round(positions.reduce((sum, value) => sum + value, 0) / positions.length, 1),
      visibility: round(visibility),
      relevance: relevances.length ? round(relevances.reduce((sum, value) => sum + value, 0) / relevances.length) : null,
      strength: Math.round(100 * (0.5 * coverage + 0.5 * visibility)),
      eligible: appearances >= minAppearances,
      searches,
    });
  }

  candidates.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      b.strength - a.strength ||
      b.top10 - a.top10 ||
      a.bestPosition - b.bestPosition ||
      a.domain.localeCompare(b.domain),
  );
  excluded.sort((a, b) => b.appearances - a.appearances || a.domain.localeCompare(b.domain));
  return { queriesChecked, candidates, excluded, minAppearances };
}

/** The one strongest recurring candidate, or null when none recurs. */
export function selectStrongestCandidate(aggregation: CandidateAggregation): Candidate | null {
  return aggregation.candidates.find((candidate) => candidate.eligible) ?? null;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
