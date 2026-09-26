import { isCrawled } from "@/lib/page-audit";
import type { PlanLimits } from "@/lib/plan";
import { findHomepage } from "@/lib/site-url";

type ScopePage = {
  id: string;
  url: string;
  finalUrl?: string | null;
  status: string;
  crawlTier?: string | null;
};

/**
 * The pages a plan's analysis covers.
 *
 * Paid plans analyze every crawled page. Free analyzes its Priority pages
 * only, at most `priorityPages` of them. The worker already stores Free's
 * Standard pages unanalyzed; this also holds for a crawl made on a paid plan
 * that has since lapsed, and for crawls from before Priority / Standard
 * tiers, when Free covered the homepage alone.
 */
export function analysisScope<T extends ScopePage>(pages: T[], rootUrl: string, limits: PlanLimits): T[] {
  if (limits.analyzeStandardPages) {
    return pages;
  }
  const priority = pages.filter((page) => page.crawlTier === "priority" && isCrawled(page));
  if (priority.length > 0) {
    return priority.slice(0, limits.priorityPages);
  }
  if (pages.some((page) => page.crawlTier != null)) {
    return [];
  }
  const homepage = findHomepage(pages, rootUrl);
  return homepage ? [homepage] : [];
}
