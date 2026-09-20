import { assertSafeUrl, guardedLookup, safeFetch } from "@seo-maker/core/net";
import {
  CheerioCrawler,
  type CheerioCrawlingContext,
  Configuration,
  NonRetryableError,
} from "crawlee";
import { type PageAudit, normalizePageUrl } from "./crawler.js";

/**
 * Crawler for third-party competitor sites.
 *
 * Deliberately a fork of `crawlSite` rather than a flag on it: this one reaches
 * hosts the user supplied, so it enforces SSRF rules and robots.txt Disallow,
 * and a mistake here must not be able to regress the first-party crawl.
 */

const DEFAULT_MAX_PAGES = 25;

function hostKey(hostname: string) {
  return hostname.replace(/^www\./, "").toLowerCase();
}

export type RobotsRules = {
  robotsTxtUrl: string;
  robotsOk: boolean;
  sitemapUrl: string | null;
  hasSitemap: boolean;
  disallow: string[];
};

/** Parses the `*` (and our own) user-agent group out of robots.txt. */
export function parseRobots(text: string): { disallow: string[]; sitemaps: string[] } {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  let appliesToUs = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(":");
    const field = rawField.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!value && field !== "disallow") continue;

    if (field === "user-agent") {
      const agent = value.toLowerCase();
      appliesToUs = agent === "*" || agent.includes("seo-maker");
    } else if (field === "disallow" && appliesToUs) {
      if (value) disallow.push(value);
    } else if (field === "sitemap") {
      sitemaps.push(value);
    }
  }

  return { disallow, sitemaps };
}

/** Standard robots.txt prefix matching, with `*` and `$` wildcards. */
export function isDisallowed(pathname: string, disallow: string[]): boolean {
  return disallow.some((rule) => {
    if (!rule) return false;
    if (!rule.includes("*") && !rule.endsWith("$")) {
      return pathname.startsWith(rule);
    }
    const pattern = rule
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\\\$$/, "$");
    return new RegExp(`^${pattern}`).test(pathname);
  });
}

async function fetchRobots(origin: string): Promise<RobotsRules> {
  const robotsTxtUrl = `${origin}/robots.txt`;
  try {
    const response = await safeFetch(robotsTxtUrl, {
      allowAnyContentType: true,
      timeoutMs: 10_000,
      maxBytes: 512 * 1024,
    });
    if (response.status >= 400) {
      return { robotsTxtUrl, robotsOk: false, sitemapUrl: null, hasSitemap: false, disallow: [] };
    }
    const { disallow, sitemaps } = parseRobots(response.body);
    return {
      robotsTxtUrl,
      robotsOk: true,
      sitemapUrl: sitemaps[0] ?? `${origin}/sitemap.xml`,
      hasSitemap: sitemaps.length > 0,
      disallow,
    };
  } catch {
    return { robotsTxtUrl, robotsOk: false, sitemapUrl: null, hasSitemap: false, disallow: [] };
  }
}

async function fetchSitemapUrls(sitemapUrl: string, siteHost: string, limit: number) {
  try {
    const response = await safeFetch(sitemapUrl, {
      allowAnyContentType: true,
      timeoutMs: 10_000,
      maxBytes: 2 * 1024 * 1024,
    });
    if (response.status >= 400) return [];
    const locs = [...response.body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) =>
      match[1].trim().replace(/&amp;/g, "&"),
    );
    return locs
      .map((url) => normalizePageUrl(url))
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
  pages: PageAudit[];
  robots: RobotsRules;
  blockedByRobots: number;
};

export async function crawlCompetitor(
  domain: string,
  maxPages = DEFAULT_MAX_PAGES,
  hooks?: { onPage?: (audit: PageAudit) => Promise<void> },
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
  const sitemapUrls = robots.sitemapUrl
    ? await fetchSitemapUrls(robots.sitemapUrl, startHost, limit)
    : [];

  const seeds = [...new Set([entry.url.toString(), ...sitemapUrls])]
    .filter((url) => {
      try {
        return !isDisallowed(new URL(url).pathname, robots.disallow);
      } catch {
        return false;
      }
    })
    .slice(0, limit);

  if (seeds.length === 0) {
    throw new NonRetryableError("robots.txt disallows crawling this site.");
  }

  const pages: PageAudit[] = [];
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
        if (isDisallowed(loaded.pathname, robots.disallow)) {
          blockedByRobots += 1;
          return;
        }

        const audit = extractAudit($, loadedUrl, loaded, response, robots);
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
                if (isDisallowed(url.pathname, robots.disallow)) return false;
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
  robots: RobotsRules,
): PageAudit {
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
  const text = clean($("body").text());
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
    wordCount: text ? text.split(" ").filter(Boolean).length : 0,
    imageCount: images.length,
    missingAlt: images.filter((img) => !$(img).attr("alt")?.trim()).length,
    internalLinks,
    schemaCount: $('script[type="application/ld+json"]')
      .toArray()
      .filter((script) => $(script).text().trim().length > 0).length,
    robotsTxtUrl: robots.robotsTxtUrl,
    robotsOk: robots.robotsOk,
    sitemapUrl: robots.sitemapUrl,
    hasSitemap: robots.hasSitemap,
    xRobotsTag,
    indexable: !noindex && (response?.statusCode ?? 0) < 400,
  };
}
