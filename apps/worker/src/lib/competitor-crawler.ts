import { assertSafeUrl, guardedLookup, safeFetch } from "@seo-maker/core/net";
import { hostKey, normalizePageUrl } from "@seo-maker/core/crawl";
import {
  type RobotsGroup,
  type RobotsOutcome,
  fetchRobotsTxt,
  groupFor,
  isPathDisallowed,
} from "@seo-maker/core/robots";
import { parseSitemapXml } from "@seo-maker/core/sitemap";
import { NON_CONTENT_SELECTOR, classifyPage, countWords, normalizeContent } from "@seo-maker/core/page";
import {
  CheerioCrawler,
  type CheerioCrawlingContext,
  Configuration,
  NonRetryableError,
} from "crawlee";
import { schemaTypesOf } from "./extract.js";

/**
 * Crawler for third-party competitor sites.
 *
 * Deliberately a fork of `crawlSite` rather than a flag on it: this one reaches
 * hosts the user supplied, so it enforces SSRF rules and robots.txt Disallow,
 * and a mistake here must not be able to regress the first-party crawl.
 */

const DEFAULT_MAX_PAGES = 25;

/**
 * Competitor pages only need the comparison fields, so this stays a narrow
 * shape rather than the first-party `PageAudit`. Keeping them separate is what
 * lets the first-party crawler grow its Phase 0 evidence fields without
 * dragging a third-party crawl into storing page bodies it has no use for.
 *
 * Headings, schema types and a page type were added for the competitor
 * comparison (Phase 4.1): they say what a page is about and what it marks up,
 * which is what a topic or structured-data gap is measured on. Still no body.
 */
export type CompetitorPageAudit = {
  url: string;
  finalUrl: string | null;
  isHttps: boolean;
  statusCode: number | null;
  title: string | null;
  metaDesc: string | null;
  h1: string | null;
  h2Count: number;
  canonicalUrl: string | null;
  wordCount: number;
  imageCount: number;
  missingAlt: number;
  internalLinks: number;
  schemaCount: number;
  indexable: boolean;
  xRobotsTag: string | null;
  /** H2 and H3 texts, capped. */
  headings: string[];
  schemaTypes: string[];
  /** Deterministic classification, as for your own pages. */
  pageType: string | null;
};

export type RobotsRules = {
  robotsTxtUrl: string;
  robotsOk: boolean;
  sitemapUrl: string | null;
  hasSitemap: boolean;
  /** Rules that apply to our user agent, already selected from the file. */
  group: RobotsGroup | null;
  outcome: RobotsOutcome;
  /** Why the file could not be used, when it could not. */
  error: string | null;
};

/**
 * robots.txt for a competitor, by RFC 9309 (see fetchRobotsTxt): redirects
 * followed, a 4xx means no rules, and a 5xx or network failure means the
 * site must be treated as closed. That last case stops the crawl: this is a
 * site the user does not own, so it gets the strict reading.
 */
async function fetchRobots(origin: string): Promise<RobotsRules> {
  const fetched = await fetchRobotsTxt(origin, { timeoutMs: 10_000 });
  const robotsTxtUrl = fetched.finalUrl ?? fetched.url;
  if (fetched.outcome !== "ok" || !fetched.parsed) {
    return {
      robotsTxtUrl,
      robotsOk: false,
      sitemapUrl: null,
      hasSitemap: false,
      group: null,
      outcome: fetched.outcome,
      error: fetched.error,
    };
  }
  return {
    robotsTxtUrl,
    robotsOk: true,
    sitemapUrl: fetched.parsed.sitemaps[0] ?? `${origin}/sitemap.xml`,
    hasSitemap: fetched.parsed.sitemaps.length > 0,
    group: groupFor(fetched.parsed),
    outcome: "ok",
    error: fetched.truncated ? fetched.error : null,
  };
}

async function fetchSitemapUrls(sitemapUrl: string, siteHost: string, limit: number) {
  try {
    const response = await safeFetch(sitemapUrl, {
      allowAnyContentType: true,
      timeoutMs: 10_000,
      maxBytes: 2 * 1024 * 1024,
    });
    if (response.status >= 400) return [];
    return parseSitemapXml(response.body)
      .entries.map((entry) => normalizePageUrl(entry.loc))
      .filter((url): url is string => {
        if (!url) return false;
        try {
          return hostKey(new URL(url).hostname) === siteHost;
        } catch {
          return false;
        }
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}

export type CompetitorCrawlResult = {
  pages: CompetitorPageAudit[];
  robots: RobotsRules;
  blockedByRobots: number;
};

export async function crawlCompetitor(
  domain: string,
  maxPages = DEFAULT_MAX_PAGES,
  hooks?: { onPage?: (audit: CompetitorPageAudit) => Promise<void> },
): Promise<CompetitorCrawlResult> {
  const origin = `https://${hostKey(domain)}`;

  // Layer 0: never even start on a host that fails the SSRF rules.
  const entry = await assertSafeUrl(origin);
  if (!entry.ok) {
    throw new NonRetryableError(`Blocked competitor URL (${entry.reason})`);
  }

  const limit = Math.max(1, Math.min(maxPages, DEFAULT_MAX_PAGES));
  const startHost = hostKey(entry.url.hostname);
  const robots = await fetchRobots(entry.url.origin);
  if (robots.outcome === "unreachable") {
    throw new NonRetryableError(
      `robots.txt could not be fetched (${robots.error ?? "no answer"}). Crawlers must treat the site as closed until it answers.`,
    );
  }
  const sitemapUrls = robots.sitemapUrl
    ? await fetchSitemapUrls(robots.sitemapUrl, startHost, limit)
    : [];

  const seeds = [...new Set([entry.url.toString(), ...sitemapUrls])]
    .filter((url) => {
      try {
        return !isPathDisallowed(new URL(url).pathname, robots.group);
      } catch {
        return false;
      }
    })
    .slice(0, limit);

  if (seeds.length === 0) {
    throw new NonRetryableError("robots.txt disallows crawling this site.");
  }

  const pages: CompetitorPageAudit[] = [];
  const seen = new Set<string>();
  let blockedByRobots = 0;

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: limit,
      maxConcurrency: 1,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 20,
      preNavigationHooks: [
        async ({ request }, gotOptions) => {
          // Layer 1: validate every hop, including links enqueueLinks found.
          const check = await assertSafeUrl(request.url);
          if (!check.ok) {
            throw new NonRetryableError(`Blocked URL (${check.reason})`);
          }
          if (gotOptions) {
            // Layer 2: the real DNS-rebinding defense. Resolves at connect time
            // against the address the socket actually uses, so a TTL-0 flip
            // between validation and fetch is still caught.
            gotOptions.dnsLookup = guardedLookup;
            gotOptions.maxRedirects = 3;
            gotOptions.timeout = { request: 20_000 };
            // Layer 3: re-validate each redirect hop rather than trusting got.
            gotOptions.hooks = {
              ...(gotOptions.hooks ?? {}),
              beforeRedirect: [
                async (options: { url?: URL | string }) => {
                  const target = options.url;
                  if (!target) return;
                  const hop = await assertSafeUrl(
                    typeof target === "string" ? target : target.toString(),
                  );
                  if (!hop.ok) {
                    throw new NonRetryableError(`Blocked redirect (${hop.reason})`);
                  }
                },
              ],
            };
          }
        },
      ],
      async requestHandler({ $, request, response, enqueueLinks }) {
        const loadedUrl = normalizePageUrl(request.loadedUrl ?? request.url) ?? request.url;
        if (seen.has(loadedUrl)) return;
        seen.add(loadedUrl);

        const loaded = new URL(loadedUrl);
        if (isPathDisallowed(loaded.pathname, robots.group)) {
          blockedByRobots += 1;
          return;
        }

        const audit = extractAudit($, loadedUrl, loaded, response);
        pages.push(audit);
        if (hooks?.onPage) {
          await hooks.onPage(audit);
        }

        if (limit > 1) {
          await enqueueLinks({
            strategy: "same-domain",
            transformRequestFunction: (req) => {
              const next = normalizePageUrl(req.url);
              if (!next || seen.has(next)) return false;
              try {
                const url = new URL(next);
                if (hostKey(url.hostname) !== startHost) return false;
                if (isPathDisallowed(url.pathname, robots.group)) return false;
              } catch {
                return false;
              }
              req.url = next;
              req.uniqueKey = next;
              return req;
            },
          });
        }
      },
      failedRequestHandler({ request }) {
        console.error(`[competitor-crawl] failed ${request.url}`);
      },
    },
    new Configuration({ persistStorage: false, systemInfoV2: false }),
  );

  await crawler.run(seeds.map((url) => ({ url, uniqueKey: url })));

  if (pages.length === 0) {
    throw new NonRetryableError(`Could not fetch any pages from ${domain}`);
  }

  return { pages, robots, blockedByRobots };
}

/** Cheerio's API as crawlee hands it to us, without depending on cheerio directly. */
type CheerioApi = CheerioCrawlingContext["$"];

function extractAudit(
  $: CheerioApi,
  loadedUrl: string,
  loaded: URL,
  response: { statusCode?: number; headers?: Record<string, unknown> } | undefined,
): CompetitorPageAudit {
  const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

  const title = clean($("title").first().text());
  const metaDesc = clean(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content"),
  );
  const h1 = clean($("h1").first().text());
  const canonical = clean($('link[rel="canonical"]').attr("href"));
  const robotsMeta = clean(
    $('meta[name="robots"]').attr("content") ?? $('meta[name="googlebot"]').attr("content"),
  ).toLowerCase();
  const xRobotsTag = response?.headers?.["x-robots-tag"]?.toString()?.toLowerCase() ?? null;
  const images = $("img").toArray();
  const noindex =
    robotsMeta.includes("noindex") || (xRobotsTag ? xRobotsTag.includes("noindex") : false);

  const originHost = hostKey(loaded.hostname);
  const internalLinks = $("a[href]")
    .toArray()
    .map((anchor) => $(anchor).attr("href"))
    .reduce((count, href) => {
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return count;
      }
      try {
        const target = normalizePageUrl(new URL(href, loaded).toString());
        if (!target) return count;
        return hostKey(new URL(target).hostname) === originHost ? count + 1 : count;
      } catch {
        return count;
      }
    }, 0);

  let canonicalUrl: string | null = null;
  if (canonical) {
    try {
      canonicalUrl = normalizePageUrl(new URL(canonical, loadedUrl).toString());
    } catch {
      canonicalUrl = null;
    }
  }

  const schemaScripts = $('script[type="application/ld+json"]')
    .toArray()
    .filter((script) => $(script).text().trim().length > 0);
  const schemaCount = schemaScripts.length;
  const schemaTypes = [
    ...new Set(
      schemaScripts.flatMap((script) => {
        try {
          return schemaTypesOf(JSON.parse($(script).text()));
        } catch {
          return [];
        }
      }),
    ),
  ];

  // Before the text is read: removing <svg> would also strip a heading that is
  // an inline logo, exactly as on first-party pages.
  const headings = $("h2, h3")
    .toArray()
    .map((node) => clean($(node).text()).slice(0, 200))
    .filter(Boolean)
    .slice(0, 30);

  // Read text last: this mutates the document. Without the removal, `.text()`
  // includes <script> bodies, which inflated competitor word counts the same
  // way it inflated our own and made every competitor look content-rich.
  $(NON_CONTENT_SELECTOR).remove();
  const content = normalizeContent($("body").text());
  const wordCount = countWords(content);

  return {
    url: loadedUrl,
    finalUrl: loadedUrl,
    isHttps: loaded.protocol === "https:",
    statusCode: response?.statusCode ?? null,
    title: title || null,
    metaDesc: metaDesc || null,
    h1: h1 || null,
    h2Count: $("h2").length,
    canonicalUrl,
    wordCount,
    imageCount: images.length,
    // Same rule as our own pages: only an absent alt is missing; alt="" is decorative.
    missingAlt: images.filter((img) => $(img).attr("alt") == null).length,
    internalLinks,
    schemaCount,
    xRobotsTag,
    indexable: !noindex && (response?.statusCode ?? 0) < 400,
    headings,
    schemaTypes,
    pageType: classifyPage({ url: loadedUrl, title, h1, schemaTypes, wordCount }).type,
  };
}
