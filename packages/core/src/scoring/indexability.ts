import { type PageType, noindexIsExpected } from "../page/classify";

/**
 * Indexability verdict.
 *
 * PRD §11.7 requires the product to tell intentional non-indexing apart from a
 * problem. The previous rule was `indexable === false → critical`, which on
 * stripe.com marked 33 deliberately-excluded legal pages as Critical and
 * dragged the site score down for something the site did on purpose.
 *
 * The deciding evidence is the site's own two statements about the page:
 *
 *   in sitemap + noindex  → contradiction, and a real bug worth reporting
 *   not in sitemap + noindex → deliberate exclusion, not a finding
 *
 * Sitemap membership is a deliberate, machine-readable act by the site owner,
 * which makes it a far better signal than guessing from the URL. Page type is
 * only a fallback for sites that publish no sitemap at all.
 */

export type IndexabilityStatus = "pass" | "warning" | "fail";

export type IndexabilityReason =
  | "indexable"
  | "error-status"
  | "sitemap-conflict"
  | "intentional-exclusion"
  | "robots-conflict"
  | "unverified-noindex";

export type IndexabilityVerdict = {
  status: IndexabilityStatus;
  reason: IndexabilityReason;
  /** True when the exclusion looks deliberate and should not count against the site. */
  intentional: boolean;
  message: string;
};

export type IndexabilityInput = {
  statusCode?: number | null;
  /** False when robots meta or X-Robots-Tag says noindex. */
  indexable?: boolean | null;
  /** Whether the site's own sitemap advertises this URL. Null when no sitemap. */
  inSitemap?: boolean | null;
  /** Whether robots.txt forbids the path. */
  robotsDisallowed?: boolean | null;
  pageType?: string | null;
};

export function indexabilityVerdict(input: IndexabilityInput): IndexabilityVerdict {
  const status = input.statusCode ?? null;

  if (status != null && status >= 400) {
    return {
      status: "fail",
      reason: "error-status",
      intentional: false,
      message: `The page responds with HTTP ${status}, so it cannot be indexed.`,
    };
  }

  if (input.indexable !== false) {
    // A sitemap-listed URL that robots.txt blocks is still a contradiction even
    // when the page itself is indexable — search engines cannot fetch it.
    if (input.robotsDisallowed === true && input.inSitemap === true) {
      return {
        status: "fail",
        reason: "robots-conflict",
        intentional: false,
        message:
          "The sitemap advertises this URL but robots.txt blocks it, so search engines cannot crawl it.",
      };
    }
    return {
      status: "pass",
      reason: "indexable",
      intentional: false,
      message: "The page is available for indexing.",
    };
  }

  if (input.inSitemap === true) {
    return {
      status: "fail",
      reason: "sitemap-conflict",
      intentional: false,
      message:
        "The sitemap asks search engines to index this URL but the page itself sends noindex. One of the two is wrong.",
    };
  }

  if (input.inSitemap === false) {
    return {
      status: "pass",
      reason: "intentional-exclusion",
      intentional: true,
      message:
        "The page sends noindex and is deliberately left out of the sitemap, so the exclusion looks intentional.",
    };
  }

  // No sitemap to compare against: fall back to page type, and never escalate
  // past a warning on evidence this thin.
  if (noindexIsExpected(input.pageType as PageType | null)) {
    return {
      status: "pass",
      reason: "intentional-exclusion",
      intentional: true,
      message: `The page sends noindex, which is normal for a ${input.pageType} page.`,
    };
  }

  return {
    status: "warning",
    reason: "unverified-noindex",
    intentional: false,
    message:
      "The page sends noindex and there is no sitemap to confirm whether that is intentional.",
  };
}
