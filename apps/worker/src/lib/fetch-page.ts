import type { CrawlTier } from "@seo-maker/core/crawl";
import { assertSafeUrl } from "@seo-maker/core/net";
import { hostKey, normalizePageUrl } from "@seo-maker/core/crawl";
import { fetchRobotsTxt, groupFor, isPathDisallowed } from "@seo-maker/core/robots";
import { CheerioCrawler, Configuration } from "crawlee";
import {
  type AuditInput,
  type ClassifyContext,
  type DiscoveredVia,
  type PageAudit,
  ROBOTS_REDIRECT,
  USER_AGENT,
  auditPage,
  classifyError,
  guardRequests,
} from "./crawler.js";

/** What a single-page fetch returns: the page's audit, or why there is none. */
export type FetchPageResult = { ok: true; audit: PageAudit } | { ok: false; reason: string; statusCode: number | null };

export type FetchPageOptions = {
  /** priority: full content (text, images, structured data). standard: what the checks need. */
  tier: CrawlTier;
  classify?: ClassifyContext;
  /** Crawl-level facts the page row carries: robots.txt and sitemap, from the crawl it belongs to. */
  siteFacts: Omit<AuditInput["site"], "robotsDisallowed">;
  depth: number | null;
  discoveredVia: DiscoveredVia;
};

/**
 * Fetches one page of a site, and nothing else on it.
 *
 * Two callers: a Standard page the user made Priority, fetched in full now
 * rather than at the next crawl, and "Crawl page", which fetches a page again
 * at its own tier after the user changed it. Same guards as a crawl: SSRF
 * checks on every hop, robots.txt (a disallowed page, or a redirect into one,
 * is not fetched), and the same extractor and classifier.
 */
export async function fetchPage(url: string, options: FetchPageOptions): Promise<FetchPageResult> {
  const target = normalizePageUrl(url);
  if (!target) return { ok: false, reason: "Not a valid page address.", statusCode: null };
  const entry = await assertSafeUrl(target);
  if (!entry.ok) return { ok: false, reason: `That address cannot be fetched (${entry.reason}).`, statusCode: null };

  const siteHost = hostKey(entry.url.hostname);
  const robots = await fetchRobotsTxt(entry.url.origin, { userAgent: USER_AGENT, timeoutMs: 10_000 });
  const group = robots.parsed ? groupFor(robots.parsed) : null;
  if (isPathDisallowed(entry.url.pathname, group)) {
    return { ok: false, reason: "robots.txt disallows this page, so it is not fetched.", statusCode: null };
  }

  let result: FetchPageResult = { ok: false, reason: "The page could not be fetched.", statusCode: null };

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: 1,
      maxConcurrency: 1,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 30,
      preNavigationHooks: [guardRequests({ siteHost, group })],
      async requestHandler({ $, request, response }) {
        const requestedUrl = normalizePageUrl(request.url) ?? request.url;
        const loadedUrl = normalizePageUrl(request.loadedUrl ?? request.url) ?? requestedUrl;
        const loaded = new URL(loadedUrl);
        if (hostKey(loaded.hostname) !== siteHost) {
          result = {
            ok: false,
            reason: `The page redirects off the site, to ${loaded.hostname}.`,
            statusCode: response?.statusCode ?? null,
          };
          return;
        }
        const { audit } = auditPage({
          $,
          requestedUrl,
          loadedUrl,
          statusCode: response?.statusCode ?? null,
          headers: response?.headers ?? {},
          tier: options.tier,
          classify: options.classify,
          site: { ...options.siteFacts, robotsDisallowed: false },
          depth: options.depth,
          discoveredVia: options.discoveredVia,
        });
        result = { ok: true, audit };
      },
      async failedRequestHandler({ response }, error) {
        const message = error instanceof Error ? error.message : String(error);
        result = {
          ok: false,
          reason: message.includes(ROBOTS_REDIRECT)
            ? "The page redirects into a path robots.txt disallows."
            : response?.statusCode
              ? `The page answered HTTP ${response.statusCode}.`
              : `The page could not be fetched (${classifyError(error, null)}).`,
          statusCode: response?.statusCode ?? null,
        };
      },
    },
    new Configuration({ persistStorage: false, systemInfoV2: false }),
  );

  await crawler.run([{ url: target, uniqueKey: target }]);
  return result;
}
