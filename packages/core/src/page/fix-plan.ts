/**
 * How each failing check gets fixed (Phase 2.2).
 *
 * Not every issue should go through AI. For each failing check this decides
 * whether the fix is:
 *
 *  - deterministic: the crawl already contains the answer (a canonical URL is
 *    the page's own address; a sitemap line needs the sitemap the crawl found),
 *  - ai-generate: a model writes a page-specific suggestion from real evidence,
 *  - blocked: the evidence a specific answer needs was not captured, so the
 *    honest output is to say what is missing rather than invent it.
 *
 * Every failing check is also explained by the page-recommendation feature, so
 * "AI explanation" is not a separate strategy here; it applies to all of them.
 */

import type { ImageEvidence } from "./intelligence";

export type FixStrategy = "deterministic" | "ai-generate" | "blocked";

/** AI features that write a suggestion for one check. */
export type FixFeature =
  | "title"
  | "meta"
  | "heading"
  | "content"
  | "schema"
  | "internal-link"
  | "image-alt";

export type FixPlanInput = {
  url: string;
  finalUrl?: string | null;
  statusCode?: number | null;
  pageType?: string | null;
  pageTypeScore?: number | null;
  h1?: string | null;
  wordCount?: number | null;
  /** Characters of captured body text. 0 when none was captured. */
  contentLength: number;
  indexable?: boolean | null;
  inSitemap?: boolean | null;
  robotsMeta?: string | null;
  xRobotsTag?: string | null;
  robotsTxtUrl?: string | null;
  sitemapUrl?: string | null;
  /** Images with no alt attribute that carry a caption, nearby text or a filename. */
  describableMissingAlt: number;
  /**
   * Images with no alt attribute that an AI provider able to see images can
   * look at: a fetchable address, and such a provider configured. 0 otherwise.
   */
  viewableMissingAlt?: number;
  /** priority | standard. A Standard page has no captured text. */
  crawlTier?: string | null;
  missingAlt?: number | null;
  /** Other pages the crawl found on this site, which are the only valid link targets. */
  knownUrlCount: number;
  /** Failing and warning checks, from the persisted PageIssue rows. */
  failing: Array<{ checkId: string; status: string; severity: string }>;
};

export type PlannedFix = {
  checkId: string;
  status: string;
  severity: string;
  strategy: FixStrategy;
  /** The AI feature that writes the suggestion, when strategy is ai-generate. */
  feature: FixFeature | null;
  /** Why this strategy, stated for the user. */
  reason: string;
  /** A ready-to-use fix taken from the crawl, for deterministic strategies. */
  fix: { label: string; value: string; language: "html" | "text" } | null;
};

/** Enough text to say what a page is about without guessing. */
const MIN_WORDS_FOR_HEADING = 150;
const MIN_CHARS_FOR_META = 200;
const MIN_TYPE_CONFIDENCE_FOR_SCHEMA = 0.6;
const MIN_LINK_TARGETS = 3;

export function planFixes(input: FixPlanInput): PlannedFix[] {
  return input.failing.map((issue) => {
    const planned = planOne(issue.checkId, input);
    return { checkId: issue.checkId, status: issue.status, severity: issue.severity, ...planned };
  });
}

type Plan = Pick<PlannedFix, "strategy" | "feature" | "reason" | "fix">;

function deterministic(reason: string, fix: PlannedFix["fix"] = null): Plan {
  return { strategy: "deterministic", feature: null, reason, fix };
}

function generate(feature: FixFeature, reason: string): Plan {
  return { strategy: "ai-generate", feature, reason, fix: null };
}

function blocked(reason: string): Plan {
  return { strategy: "blocked", feature: null, reason, fix: null };
}

function planOne(checkId: string, input: FixPlanInput): Plan {
  const address = input.finalUrl ?? input.url;
  const words = input.wordCount ?? 0;

  switch (checkId) {
    case "status":
      return deterministic(
        `The page answered HTTP ${input.statusCode ?? "with no status"}. The fix is on the server or in the links that point here, not in the page copy.`,
      );

    case "canonical":
      return deterministic(
        "A self-referencing canonical is the page's own crawled address, so it comes from the crawl rather than from AI. Use a different URL only if this page is a deliberate duplicate.",
        { label: "Add to <head>", value: `<link rel="canonical" href="${address}" />`, language: "html" },
      );

    case "indexability": {
      const noindex = /noindex/i.test(`${input.robotsMeta ?? ""} ${input.xRobotsTag ?? ""}`);
      if (noindex && input.inSitemap) {
        const excludeOnPurpose = input.pageType === "legal" || input.pageType === "landing";
        return deterministic(
          "The sitemap asks search engines to index this URL, but the page itself says noindex. Decide which is intended; SEO Maker cannot know that for you.",
          excludeOnPurpose
            ? { label: "If it should stay out of search", value: `Remove ${address} from the sitemap.`, language: "text" }
            : {
                label: "If it should be indexed",
                value: 'Remove "noindex" from the robots meta tag and the X-Robots-Tag header on this page.',
                language: "text",
              },
        );
      }
      return deterministic(
        "Indexability follows from the page's robots directives, the sitemap and the status code, which the crawl already recorded. Make them agree on whether this URL should be indexed.",
      );
    }

    case "robots":
      return deterministic(
        "robots.txt could not be fetched. A minimal file that allows crawling is below; the Sitemap line is only included when the crawl found a sitemap.",
        {
          label: `Serve at ${originOf(address)}/robots.txt`,
          value: ["User-agent: *", "Allow: /", input.sitemapUrl ? `Sitemap: ${input.sitemapUrl}` : null]
            .filter(Boolean)
            .join("\n"),
          language: "text",
        },
      );

    case "sitemap":
      return input.sitemapUrl
        ? deterministic("The crawl found this sitemap, but robots.txt does not declare it.", {
            label: "Add to robots.txt",
            value: `Sitemap: ${input.sitemapUrl}`,
            language: "text",
          })
        : deterministic(
            "Publish an XML sitemap of your canonical URLs and declare it in robots.txt. The crawl found none, so SEO Maker will not invent its address.",
          );

    case "title":
      return input.contentLength > 0 || input.h1
        ? generate("title", "Written from the page's own H1 and text.")
        : blocked("No page text or H1 was captured, so any title would be invented.");

    case "meta":
      return input.contentLength >= MIN_CHARS_FOR_META
        ? generate("meta", "Written from the page's own text.")
        : blocked("Too little page text was captured to describe this page honestly.");

    case "h1":
      return words >= MIN_WORDS_FOR_HEADING
        ? generate("heading", "Written from the page's own text and headings.")
        : blocked(`The page has ${words} words, too few to state what it is about without guessing.`);

    case "h2":
    case "words":
      return input.contentLength > 0
        ? generate("content", "Missing topics and an outline, based on what the page already says.")
        : blocked("No page text was captured, so there is nothing to build an outline from.");

    case "links":
      // A link has to go somewhere in the page's own text. With none captured,
      // the model can only return nothing, which is a wasted call.
      if (input.contentLength === 0) {
        return blocked("No page text was captured, so there is nowhere on the page to place a link.");
      }
      return input.knownUrlCount >= MIN_LINK_TARGETS
        ? generate("internal-link", "Targets are limited to pages the crawl actually found.")
        : blocked(
            `The crawl found ${input.knownUrlCount} other ${input.knownUrlCount === 1 ? "page" : "pages"}, too few to suggest real link targets. Crawl more of the site first.`,
          );

    case "schema": {
      const confident =
        input.pageType &&
        input.pageType !== "other" &&
        (input.pageTypeScore ?? 0) >= MIN_TYPE_CONFIDENCE_FOR_SCHEMA;
      return confident
        ? generate("schema", `The page is classified as ${input.pageType}, so its schema.org type is known.`)
        : blocked(
            `The page type is uncertain (${input.pageType ?? "unknown"}, ${Math.round((input.pageTypeScore ?? 0) * 100)}% confidence), so the right schema.org type is not known.`,
          );
    }

    case "images": {
      const missing = input.missingAlt ?? 0;
      const viewable = input.viewableMissingAlt ?? 0;
      if (viewable > 0) {
        return generate(
          "image-alt",
          `${viewable} of ${missing} images can be shown to the AI, which describes them from the image itself. Every suggestion still needs a human check.`,
        );
      }
      if (input.describableMissingAlt > 0) {
        return generate(
          "image-alt",
          `${input.describableMissingAlt} of ${missing} images carry a caption, nearby text or a filename. SEO Maker cannot see images, so every suggestion needs a human check.`,
        );
      }
      return blocked(
        `None of the ${missing} images without alt text carries a caption or nearby text, and SEO Maker cannot see images. A person needs to write these.`,
      );
    }

    default:
      return blocked("No fix strategy is defined for this check yet.");
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** A stored page, structurally. Both the Prisma row and test fixtures satisfy it. */
export type FixPlanPage = {
  url: string;
  finalUrl?: string | null;
  statusCode?: number | null;
  pageType?: string | null;
  pageTypeScore?: number | null;
  h1?: string | null;
  wordCount?: number | null;
  content?: string | null;
  indexable?: boolean | null;
  inSitemap?: boolean | null;
  robotsMeta?: string | null;
  xRobotsTag?: string | null;
  robotsTxtUrl?: string | null;
  sitemapUrl?: string | null;
  missingAlt?: number | null;
  evidence?: unknown;
  crawlTier?: string | null;
  issues: Array<{ checkId: string; status: string; severity: string }>;
};

/**
 * Images with no alt attribute that still carry something to describe them by.
 *
 * `alt=""` is decorative and correct, so it never counts. Of the rest, only an
 * image with a caption, nearby text or a filename can get a grounded
 * suggestion; SEO Maker cannot see pixels.
 */
export function describableMissingAltImages(evidence: unknown): ImageEvidence[] {
  const images = (evidence as { images?: ImageEvidence[] } | null)?.images ?? [];
  return images.filter(
    (image) => !image.decorative && !image.alt && (image.context.trim().length > 0 || Boolean(image.filename)),
  );
}

/**
 * Images with no alt attribute whose address can be fetched, so a provider
 * that sees images can be shown them. `alt=""` is decorative and never counts.
 */
export function viewableMissingAltImages(evidence: unknown): ImageEvidence[] {
  const images = (evidence as { images?: ImageEvidence[] } | null)?.images ?? [];
  return images.filter((image) => !image.decorative && !image.alt && /^https?:\/\//i.test(image.src));
}

/** Builds the routing input from a stored page, so the worker and the UI decide identically. */
export function fixPlanInputFromPage(
  page: FixPlanPage,
  knownUrlCount: number,
  options: { imageInput?: boolean } = {},
): FixPlanInput {
  return {
    crawlTier: page.crawlTier ?? null,
    viewableMissingAlt: options.imageInput ? viewableMissingAltImages(page.evidence).length : 0,
    url: page.url,
    finalUrl: page.finalUrl,
    statusCode: page.statusCode,
    pageType: page.pageType,
    pageTypeScore: page.pageTypeScore,
    h1: page.h1,
    wordCount: page.wordCount,
    contentLength: page.content?.length ?? 0,
    indexable: page.indexable,
    inSitemap: page.inSitemap,
    robotsMeta: page.robotsMeta,
    xRobotsTag: page.xRobotsTag,
    robotsTxtUrl: page.robotsTxtUrl,
    sitemapUrl: page.sitemapUrl,
    missingAlt: page.missingAlt,
    describableMissingAlt: describableMissingAltImages(page.evidence).length,
    knownUrlCount,
    failing: page.issues,
  };
}
