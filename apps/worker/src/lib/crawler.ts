import { assertSafeUrl, createSafeUrlCache, guardedLookup, safeFetch } from "@seo-maker/core/net";
import {
  type SeedPlan,
  hostKey,
  normalizePageUrl,
  pathDepth,
  planSeeds,
} from "@seo-maker/core/crawl";
import {
  type ClassifyInput,
  type PageEvidence,
  classifyPage,
  contentFingerprint,
  inferSearchIntent,
} from "@seo-maker/core/page";
import {
  type RobotsAudit,
  buildRobotsAudit,
  groupFor,
  isPathDisallowed,
  parseRobotsTxt,
} from "@seo-maker/core/robots";
import {
  type SitemapAudit,
  type SitemapDocument,
  type SitemapUrlEvidence,
  buildSitemapAudit,
  parseSitemapXml,
} from "@seo-maker/core/sitemap";
import { CheerioCrawler, Configuration, NonRetryableError } from "crawlee";
import { extractPage } from "./extract.js";

export { normalizePageUrl } from "@seo-maker/core/crawl";

/**
 * First-party site crawler.
 *
 * Rewritten to close defects found by crawling stripe.com end to end:
 *
 *  - the 100-page budget was spent in sitemap document order, which put 72 of
 *    73 pages under /legal and never reached a product page (now `planSeeds`);
 *  - word counts included <script> text, inflating them ~6.5x and disabling
 *    the thin-content check on every page of every site (now `extractPage`);
 *  - failed fetches were never written, so the database always reported zero
 *    failures no matter how many requests errored;
 *  - redirects were invisible: `finalUrl` was assigned a copy of `url`;
 *  - robots.txt was scanned only for a `Sitemap:` line, so Disallow was ignored;
 *  - the SSRF guards in core were wired into the competitor crawler only, and
 *    the first-party path could reach private addresses.
 */

const MAX_SITEMAP_DOCUMENTS = 50;
const MAX_SITEMAP_URLS = 10_000;
const USER_AGENT = "SEO-Maker-Bot/0.1 (+https://seo-maker.app/bot)";

/** Request slack above the page budget, to absorb URLs that redirect onto a known page. */
const REQUEST_SLACK = 1.4;

export type PageAudit = {
  url: string;
  finalUrl: string | null;
  isHttps: boolean;
  statusCode: number | null;
  title: string | null;
  metaDesc: string | null;
  h1: string | null;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  canonicalUrl: string | null;
  wordCount: number;
  imageCount: number;
  missingAlt: number;
  internalLinks: number;
  externalLinks: number;
  schemaCount: number;
  robotsTxtUrl: string | null;
  robotsOk: boolean;
  sitemapUrl: string | null;
  hasSitemap: boolean;
  xRobotsTag: string | null;
  robotsMeta: string | null;
  indexable: boolean;
  inSitemap: boolean | null;
  robotsDisallowed: boolean;
  pageType: string;
  pageTypeScore: number;
  searchIntent: string | null;
  searchIntentScore: number | null;
  language: string | null;
  depth: number;
  discoveredVia: DiscoveredVia;
  redirectCount: number;
  responseTimeMs: number | null;
  contentType: string | null;
  content: string;
  contentHash: string;
  evidence: PageEvidence;
  status: "analyzed";
};

export type DiscoveredVia = "seed" | "sitemap" | "link";

/** A fetch that never produced a page. Recorded so failures stop disappearing. */
export type PageFailure = {
  url: string;
  statusCode: number | null;
  errorType: string;
  error: string;
  discoveredVia: DiscoveredVia;
  depth: number;
  status: "failed";
};

export type CrawlSiteResult = {
  pages: PageAudit[];
  failures: PageFailure[];
  robotsAudit: RobotsAudit;
  sitemapAudit: SitemapAudit;
  seedPlan: SeedPlan;
  /** Requests actually spent, which exceeds `pages` when URLs redirect onto each other. */
  requests: number;
  /** URLs deliberately not analyzed: robots.txt, duplicates after redirect, over budget. */
  skipped: number;
};

/**
 * Pages fetched in parallel within one crawl.
 *
 * 3 by default. Crawling is network wait plus Cheerio parsing on one Node
 * thread, so this is requests in flight, not CPU cores. Measured on a 4-core
 * i7 over 40 pages of stripe.com: 34s at 2 and 21s at 3, with the crawler using
 * 27% and 38% of a single core and ~480 MB either way. Override with
 * CRAWL_CONCURRENCY (1-4); above 4 the load on the crawled site stops being
 * polite.
 */
function crawlConcurrency(): number {
  const value = Number(process.env.CRAWL_CONCURRENCY);
  return Number.isFinite(value) && value >= 1 ? Math.min(4, Math.floor(value)) : 3;
}

/**
 * Longest robots.txt Crawl-delay honoured, in seconds. A site asking for a
 * delay is crawled one request at a time with that gap; the cap keeps a
 * 100-page crawl inside the crawl worker's 15-minute job lock.
 */
const MAX_CRAWL_DELAY_SECS = 5;

export type CrawlHooks = {
  onPage?: (audit: PageAudit) => Promise<void>;
  onFailure?: (failure: PageFailure) => Promise<void>;
  /** Business context that sharpens page classification (Deep mode). */
  classify?: Pick<ClassifyInput, "offerings" | "offeringKind"> & {
    /** Page types the user set, by URL path. They win over classification. */
    overrides?: Record<string, string>;
  };
};

export async function crawlSite(
  startUrl: string,
  maxPages: number,
  hooks?: CrawlHooks,
): Promise<CrawlSiteResult> {
  const normalizedStart = normalizePageUrl(startUrl);
  if (!normalizedStart) {
    throw new NonRetryableError(`Invalid start URL: ${startUrl}`);
  }

  // Layer 0 of the SSRF defense: refuse the site before any request is made.
  const entry = await assertSafeUrl(normalizedStart);
  if (!entry.ok) {
    throw new NonRetryableError(`Blocked start URL (${entry.reason}): ${entry.detail}`);
  }

  const limit = Math.max(1, Math.min(maxPages, 100));
  const origin = entry.url.origin;
  const siteHost = hostKey(entry.url.hostname);

  const robots = await readRobots(origin);
  const group = robots.parsed ? groupFor(robots.parsed) : null;
  const sitemap = await readSitemaps(robots.parsed?.sitemaps ?? [], origin, siteHost);

  const plan = planSeeds({
    start: normalizedStart,
    sitemapUrls: sitemap.urls,
    limit,
    siteHost,
    isDisallowed: (pathname) => isPathDisallowed(pathname, group),
  });

  const sitemapSet = new Set(sitemap.urls);
  const crawlDelay =
    group?.crawlDelay && group.crawlDelay > 0 ? Math.min(group.crawlDelay, MAX_CRAWL_DELAY_SECS) : 0;
  const robotsAudit = buildRobotsAudit({
    url: robots.url,
    status: robots.status,
    parsed: robots.parsed,
    group,
    sitemapUrls: sitemap.urls.slice(0, 2000),
  });

  if (robotsAudit.blocksEverything) {
    throw new NonRetryableError("robots.txt disallows crawling this site.");
  }

  // One DNS verdict per host per crawl. Without this, the per-request lookup
  // floods the resolver and its transient failures surface as blocked pages.
  const safeUrls = createSafeUrlCache();

  const pages: PageAudit[] = [];
  const failures: PageFailure[] = [];
  const seen = new Set<string>();
  const discovery = new Map<string, DiscoveredVia>();
  let requests = 0;
  let skipped = 0;

  for (const [index, url] of plan.seeds.entries()) {
    discovery.set(url, index === 0 ? "seed" : "sitemap");
  }

  const crawler = new CheerioCrawler(
    {
      // Slack above the page budget absorbs sitemap URLs that 301 onto a page
      // we already hold. Those cost a request but must not cost a page slot —
      // on stripe.com 24 of 97 successful fetches were exactly this, and the
      // crawl came back 27 pages short of its budget.
      maxRequestsPerCrawl: Math.ceil(limit * REQUEST_SLACK),
      // A site that sets Crawl-delay gets one request at a time, that far apart.
      maxConcurrency: crawlDelay ? 1 : crawlConcurrency(),
      ...(crawlDelay ? { sameDomainDelaySecs: crawlDelay } : {}),
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 30,
      preNavigationHooks: [
        async ({ request }, gotOptions) => {
          // Layer 1: validate every URL, including ones enqueueLinks found.
          const check = await safeUrls.check(request.url);
          if (!check.ok) {
            // A resolver hiccup is transient. Throwing NonRetryableError here
            // permanently marked healthy pages as blocked — 78 of them on one
            // stripe.com run — because every request re-resolved the same host.
            if (check.reason === "dns") {
              throw new Error(`Could not resolve ${request.url}`);
            }
            throw new NonRetryableError(`Blocked URL (${check.reason})`);
          }
          if (gotOptions) {
            // Layer 2: the DNS-rebinding defense. Resolves at connect time
            // against the address the socket actually uses, so a TTL-0 flip
            // between validation and fetch is still caught.
            gotOptions.dnsLookup = guardedLookup;
            gotOptions.maxRedirects = 5;
            gotOptions.timeout = { request: 25_000 };
            gotOptions.headers = { ...(gotOptions.headers ?? {}), "user-agent": USER_AGENT };
            // Layer 3: re-validate each redirect hop rather than trusting got.
            gotOptions.hooks = {
              ...(gotOptions.hooks ?? {}),
              beforeRedirect: [
                async (options: { url?: URL | string }) => {
                  const target = options.url;
                  if (!target) {
                    return;
                  }
                  const hop = await safeUrls.check(
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

      async requestHandler({ $, request, response, enqueueLinks, crawler: self }) {
        requests += 1;

        const requestedUrl = normalizePageUrl(request.url) ?? request.url;
        const loadedUrl = normalizePageUrl(request.loadedUrl ?? request.url) ?? requestedUrl;

        // A sitemap URL that redirects onto a page we already hold is evidence
        // about the sitemap, not a new page.
        if (seen.has(loadedUrl)) {
          skipped += 1;
          if (requestedUrl !== loadedUrl && sitemapSet.has(requestedUrl)) {
            sitemap.evidence.push({
              url: requestedUrl,
              statusCode: response?.statusCode ?? null,
              finalUrl: loadedUrl,
              indexable: null,
            });
          }
          return;
        }
        if (pages.length >= limit) {
          skipped += 1;
          return;
        }

        const loaded = new URL(loadedUrl);

        // A redirect can leave the site entirely: stripe.com/bridge answers
        // from bridge.xyz. That is a fact about the sitemap, not a page of
        // this site, and storing it would audit someone else's domain.
        if (hostKey(loaded.hostname) !== siteHost) {
          skipped += 1;
          if (sitemapSet.has(requestedUrl)) {
            sitemap.evidence.push({
              url: requestedUrl,
              statusCode: response?.statusCode ?? null,
              finalUrl: loadedUrl,
              indexable: null,
            });
          }
          return;
        }

        if (isPathDisallowed(loaded.pathname, group)) {
          skipped += 1;
          return;
        }

        seen.add(loadedUrl);
        seen.add(requestedUrl);

        const extracted = extractPage($, loadedUrl);
        const headers = response?.headers ?? {};
        const xRobotsTag = headers["x-robots-tag"]?.toString()?.toLowerCase() ?? null;
        const statusCode = response?.statusCode ?? null;
        const noindex =
          (extracted.robotsMeta?.includes("noindex") ?? false) ||
          (xRobotsTag?.includes("noindex") ?? false);

        const override = hooks?.classify?.overrides?.[loaded.pathname || "/"];
        const classified = classifyPage({
          url: loadedUrl,
          title: extracted.title,
          h1: extracted.h1,
          schemaTypes: extracted.schemaTypes,
          wordCount: extracted.wordCount,
          offerings: hooks?.classify?.offerings,
          offeringKind: hooks?.classify?.offeringKind,
        });
        // The user's own statement of what a page is outranks every heuristic.
        const classification = override
          ? { type: override as typeof classified.type, confidence: 1, evidence: ["Set by you"] }
          : classified;
        const intent = inferSearchIntent({
          pageType: classification.type,
          title: extracted.title,
          h1: extracted.h1,
        });

        const via = discovery.get(requestedUrl) ?? discovery.get(loadedUrl) ?? "link";
        const redirected = loadedUrl !== requestedUrl;

        const audit: PageAudit = {
          url: loadedUrl,
          // Set only when the URL we asked for is not the one that answered,
          // so `finalUrl` means "this redirected" rather than repeating `url`.
          // It used to be assigned a copy of `url`, so no page on any site
          // ever recorded a redirect.
          finalUrl: redirected ? loadedUrl : null,
          isHttps: loaded.protocol === "https:",
          statusCode,
          title: extracted.title,
          metaDesc: extracted.metaDesc,
          h1: extracted.h1,
          h1Count: extracted.h1Count,
          h2Count: extracted.h2Count,
          h3Count: extracted.h3Count,
          canonicalUrl: extracted.canonicalUrl,
          wordCount: extracted.wordCount,
          imageCount: extracted.imageCount,
          missingAlt: extracted.missingAlt,
          internalLinks: extracted.internalLinks,
          externalLinks: extracted.externalLinks,
          schemaCount: extracted.schemaCount,
          robotsTxtUrl: robotsAudit.url,
          robotsOk: robotsAudit.found,
          sitemapUrl: sitemap.primaryUrl,
          hasSitemap: robotsAudit.hasSitemapDirective || sitemap.documents.some((doc) => doc.ok),
          xRobotsTag,
          robotsMeta: extracted.robotsMeta,
          indexable: !noindex && (statusCode ?? 0) < 400,
          // Null when the site publishes no sitemap at all, which the
          // indexability rule reads as "cannot corroborate" rather than
          // "deliberately left out".
          inSitemap: sitemap.documents.some((doc) => doc.ok) ? sitemapSet.has(loadedUrl) : null,
          robotsDisallowed: isPathDisallowed(loaded.pathname, group),
          pageType: classification.type,
          pageTypeScore: classification.confidence,
          searchIntent: intent.intent,
          searchIntentScore: intent.intent ? intent.confidence : null,
          language: extracted.language,
          depth: pathDepth(loadedUrl),
          discoveredVia: via,
          redirectCount: redirected ? 1 : 0,
          responseTimeMs: null,
          contentType: headers["content-type"]?.toString() ?? null,
          content: extracted.content,
          contentHash: contentFingerprint(extracted.content),
          evidence: {
            ...extracted.evidence,
            redirectChain: redirected
              ? [{ from: requestedUrl, to: loadedUrl, status: statusCode ?? 301 }]
              : [],
          },
          status: "analyzed",
        };

        pages.push(audit);
        if (sitemapSet.has(requestedUrl)) {
          sitemap.evidence.push({
            url: requestedUrl,
            statusCode: audit.statusCode,
            finalUrl: audit.url,
            indexable: audit.indexable,
          });
        }
        await hooks?.onPage?.(audit);

        if (pages.length >= limit) {
          // Stop now rather than letting queued requests drain the slack
          // budget fetching pages we would immediately discard.
          await self.autoscaledPool?.abort();
          return;
        }

        // Links only fill budget the sitemap left unused. On a site with a good
        // sitemap this rarely fires; on one without, it is the only source.
        if (limit > 1) {
          await enqueueLinks({
            strategy: "same-domain",
            transformRequestFunction: (req) => {
              if (pages.length >= limit) {
                return false;
              }
              const next = normalizePageUrl(req.url);
              if (!next || seen.has(next)) {
                return false;
              }
              try {
                const target = new URL(next);
                if (hostKey(target.hostname) !== siteHost) {
                  return false;
                }
                if (isPathDisallowed(target.pathname, group)) {
                  return false;
                }
              } catch {
                return false;
              }
              if (!discovery.has(next)) {
                discovery.set(next, "link");
              }
              req.url = next;
              req.uniqueKey = next;
              return req;
            },
          });
        }
      },

      /**
       * A failed fetch is a row, not a hole.
       *
       * Nothing was written here before, and the job then deleted any page not
       * re-saved, so the three PDF failures on stripe.com left the database
       * reporting zero failures.
       */
      async failedRequestHandler({ request, response }, error) {
        requests += 1;
        const url = normalizePageUrl(request.url) ?? request.url;
        if (seen.has(url)) {
          return;
        }
        seen.add(url);

        const failure: PageFailure = {
          url,
          statusCode: response?.statusCode ?? null,
          errorType: classifyError(error, response?.statusCode ?? null),
          error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          discoveredVia: discovery.get(url) ?? "link",
          depth: pathDepth(url),
          status: "failed",
        };

        failures.push(failure);
        if (sitemapSet.has(url)) {
          sitemap.evidence.push({
            url,
            statusCode: failure.statusCode,
            finalUrl: null,
            indexable: null,
          });
        }
        await hooks?.onFailure?.(failure);
      },
    },
    new Configuration({ persistStorage: false, systemInfoV2: false }),
  );

  await crawler.run(plan.seeds.map((url) => ({ url, uniqueKey: url })));

  if (pages.length === 0 && failures.length === 0) {
    throw new Error(`Could not fetch ${normalizedStart}`);
  }

  return {
    pages,
    failures,
    robotsAudit,
    sitemapAudit: buildSitemapAudit({
      documents: sitemap.documents,
      urlCount: sitemap.urls.length,
      offSiteCount: plan.offSite,
      duplicateCount: plan.duplicates,
      disallowedCount: plan.disallowed,
      evidence: sitemap.evidence,
    }),
    seedPlan: plan,
    requests,
    skipped,
  };
}

/** Single-page path, used when a project is first created. */
export async function crawlHomepageHtml(url: string): Promise<PageAudit> {
  const result = await crawlSite(url, 1);
  const homepage = result.pages[0];
  if (!homepage) {
    throw new Error(`Could not fetch ${url}`);
  }
  return homepage;
}

function classifyError(error: unknown, status: number | null): string {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (status != null && status >= 500) return "server-error";
  if (status != null && status >= 400) return "client-error";
  if (message.includes("content-type")) return "not-html";
  if (message.includes("timeout") || message.includes("timedout")) return "timeout";
  if (message.includes("blocked")) return "blocked";
  if (message.includes("enotfound") || message.includes("dns")) return "dns";
  if (message.includes("econnreset") || message.includes("socket")) return "connection";
  if (message.includes("certificate") || message.includes("ssl")) return "tls";
  return "unknown";
}

async function readRobots(origin: string) {
  const url = `${origin}/robots.txt`;
  try {
    const response = await safeFetch(url, {
      allowAnyContentType: true,
      timeoutMs: 10_000,
      maxBytes: 512 * 1024,
      headers: { "user-agent": USER_AGENT },
    });
    if (response.status >= 400) {
      return { url, status: response.status, parsed: null };
    }
    return { url, status: response.status, parsed: parseRobotsTxt(response.body) };
  } catch {
    return { url, status: null as number | null, parsed: null };
  }
}

type SitemapRead = {
  documents: SitemapDocument[];
  urls: string[];
  primaryUrl: string | null;
  evidence: SitemapUrlEvidence[];
};

/**
 * Reads every sitemap the site declares, following index documents one level.
 *
 * The old version read the first five partitions of an index and stopped at
 * 200 URLs, so on a partitioned sitemap it only ever saw the opening slice of
 * the site. Combined with in-order seeding that is how a whole 100-page crawl
 * of stripe.com ended up inside /legal.
 */
async function readSitemaps(
  declared: string[],
  origin: string,
  siteHost: string,
): Promise<SitemapRead> {
  const roots = declared.length > 0 ? declared : [`${origin}/sitemap.xml`];
  const documents: SitemapDocument[] = [];
  const urls: string[] = [];
  const seenUrls = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = roots.map((url) => ({ url, depth: 0 }));

  while (queue.length > 0 && documents.length < MAX_SITEMAP_DOCUMENTS) {
    const next = queue.shift();
    if (!next || visited.has(next.url)) {
      continue;
    }
    visited.add(next.url);

    const read = await readOneSitemap(next.url);
    documents.push(read.document);

    if (!read.parsed) {
      continue;
    }

    if (read.parsed.kind === "index" && next.depth < 2) {
      for (const entry of read.parsed.entries) {
        queue.push({ url: entry.loc, depth: next.depth + 1 });
      }
      continue;
    }

    for (const entry of read.parsed.entries) {
      if (urls.length >= MAX_SITEMAP_URLS) {
        break;
      }
      const normalized = normalizePageUrl(entry.loc);
      if (!normalized || seenUrls.has(normalized)) {
        continue;
      }
      seenUrls.add(normalized);
      try {
        if (hostKey(new URL(normalized).hostname) !== siteHost) {
          continue;
        }
      } catch {
        continue;
      }
      urls.push(normalized);
    }
  }

  return { documents, urls, primaryUrl: roots[0] ?? null, evidence: [] };
}

async function readOneSitemap(url: string) {
  try {
    const response = await safeFetch(url, {
      allowAnyContentType: true,
      timeoutMs: 15_000,
      maxBytes: 8 * 1024 * 1024,
      headers: { "user-agent": USER_AGENT },
    });

    if (response.status >= 400) {
      return {
        parsed: null,
        document: {
          url,
          kind: "unknown" as const,
          status: response.status,
          ok: false,
          entryCount: 0,
          malformedCount: 0,
          error: `HTTP ${response.status}`,
        },
      };
    }

    const parsed = parseSitemapXml(response.body);
    return {
      parsed,
      document: {
        url,
        kind: parsed.kind,
        status: response.status,
        ok: true,
        entryCount: parsed.entries.length,
        malformedCount: parsed.malformed.length,
        error: null,
      },
    };
  } catch (error) {
    return {
      parsed: null,
      document: {
        url,
        kind: "unknown" as const,
        status: null,
        ok: false,
        entryCount: 0,
        malformedCount: 0,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 200),
      },
    };
  }
}
