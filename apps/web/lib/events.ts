/**
 * Window events the app raises so screens can refresh without a reload.
 * Crawl and AI events live beside the components that raise them
 * (CRAWL_QUEUED_EVENT, AI_QUEUED_EVENT); these are the workspace-wide ones.
 */

/** A site was added, deleted or renamed: lists of sites refetch. */
export const SITES_CHANGED_EVENT = "seo-maker:sites-changed";

/** An AI request was accepted or settled: allowance meters refetch. */
export const AI_USAGE_EVENT = "seo-maker:ai-usage";

/** Competitor work was queued (added, or analysed again): the sidebar starts tracking it. */
export const COMPETITOR_QUEUED_EVENT = "seo-maker:competitor-queued";

/** Opens the workspace search from anywhere. */
export const OPEN_SEARCH_EVENT = "seo-maker:open-search";

export function emit(name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}
