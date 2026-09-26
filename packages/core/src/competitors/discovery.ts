/**
 * Automatic discovery's decisions and its stored result.
 *
 * One strongest competitor per run. When that competitor is already
 * tracked and its crawl is fresh, nothing is crawled again: the existing
 * analysis is reused, and only confidence is recalculated when the search
 * results changed.
 */

import type { CompetitorPhase } from "../queue/names";
import { isFresh } from "./policy";

export const COMPETITOR_BUSY = new Set(["queued", "crawling", "analyzing"]);

export type ExistingCompetitor = {
  status: string;
  excluded: boolean;
  pageCount: number;
  lastCrawledAt: Date | string | null;
};

/**
 *   create         new to this project: create it, crawl it
 *   reuse          tracked, crawled within the TTL: no crawl
 *   refresh        tracked, but never crawled successfully or crawled too long ago
 *   in-progress    tracked and being analyzed right now: leave it be
 *   limit-reached  new, but the plan's competitor limit is used up
 */
export type DiscoveryDecision = "create" | "reuse" | "refresh" | "in-progress" | "limit-reached";

export function decideDiscoveryAction(input: {
  existing: ExistingCompetitor | null;
  trackedCount: number;
  maxCompetitors: number;
  crawlTtlHours: number;
  now?: Date;
}): DiscoveryDecision {
  const { existing } = input;
  if (!existing || existing.excluded) {
    return input.trackedCount >= input.maxCompetitors ? "limit-reached" : "create";
  }
  if (COMPETITOR_BUSY.has(existing.status)) return "in-progress";
  const crawled = existing.status === "ready" && existing.pageCount > 0;
  return crawled && isFresh(existing.lastCrawledAt, input.crawlTtlHours, input.now) ? "reuse" : "refresh";
}

export type DiscoveryOutcome = "new" | "existing" | "refreshed" | "in-progress" | "none" | "limit-reached";

/** Stored on Project.compResult when a discovery run ends. */
export type DiscoveryResult = {
  outcome: DiscoveryOutcome;
  message: string;
  domain: string | null;
  competitorId: string | null;
  queriesChecked: number;
  appearances: number;
  top3: number;
  top10: number;
  bestPosition: number | null;
  avgPosition: number | null;
  strength: number | null;
  /** When the reused or new analysis was made. */
  lastAnalyzedAt: string | null;
  /** Whether confidence was recalculated from new search results without a crawl. */
  confidenceRefreshed: boolean;
  /** Phases that did not need to run, e.g. the crawl of a reused competitor. */
  skippedPhases: CompetitorPhase[];
  runnersUp: Array<{ domain: string; appearances: number; top10: number; bestPosition: number; strength: number }>;
  excluded: Array<{ domain: string; reason: string; appearances: number }>;
  market: { country: string | null; locationCode: number | null; languageCode: string | null };
  queries: { source: "generated" | "cached" | "existing"; count: number; fetched: number; reused: number; failed: number };
  finishedAt: string;
};

/**
 * Phases a run has already decided to skip, readable while it is still
 * running (the job stores them before it finishes), so progress never shows
 * a skipped phase as done.
 */
export function readSkippedPhases(value: unknown): CompetitorPhase[] {
  if (!value || typeof value !== "object") return [];
  const skipped = (value as { skippedPhases?: unknown }).skippedPhases;
  return Array.isArray(skipped) ? (skipped.filter((item) => typeof item === "string") as CompetitorPhase[]) : [];
}

export function readDiscoveryResult(value: unknown): DiscoveryResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DiscoveryResult>;
  return typeof raw.outcome === "string" && typeof raw.message === "string" ? (raw as DiscoveryResult) : null;
}

export function discoveryMessage(input: {
  outcome: DiscoveryOutcome;
  domain: string | null;
  appearances: number;
  queriesChecked: number;
}): string {
  const found = `across ${input.appearances} of ${input.queriesChecked} relevant searches`;
  switch (input.outcome) {
    case "new":
      return `${input.domain} is the strongest observed search competitor, found ${found}.`;
    case "existing":
      return `No new competitor found. ${input.domain} is still the strongest observed competitor for your current search queries. Existing analysis was reused.`;
    case "refreshed":
      return `${input.domain} is still the strongest observed competitor, found ${found}. Its stored crawl was out of date, so it was analyzed again.`;
    case "in-progress":
      return `${input.domain} is the strongest observed competitor and is already being analyzed.`;
    case "limit-reached":
      return `${input.domain} is the strongest observed competitor, but your plan's competitor limit is reached. Remove a competitor to add it.`;
    case "none":
      return input.queriesChecked === 0
        ? "No search results could be checked, so no competitor was found."
        : `No domain appeared often enough in your ${input.queriesChecked} searches to count as a competitor.`;
  }
}
