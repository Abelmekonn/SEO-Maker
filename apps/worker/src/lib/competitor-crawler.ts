import { type SelectedPage, selectCompetitorPages } from "@seo-maker/core/competitors";
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
 * hosts the user supplied or search results named, so it enforces SSRF rules
 * and robots.txt Disallow, and a mistake here must not be able to regress the
 * first-party crawl.
 *
 * It never crawls a whole site. The homepage is fetched first; its links, the
 * sitemap and the competitor's pages that ranked in your searches are then
 * ranked by selectCompetitorPages, and only the chosen few are fetched. No
 * link is followed beyond them.
 */

/** Hard ceiling, whatever the policy says. */
const MAX_PAGES = 15;
/** Sitemap URLs read as candidates; none is fetched unless selected. */
const SITEMAP_CANDIDATES = 500;
/** Homepage links read as candidates. */
const MAX_LINKS = 300;

/**
 * Competitor pages only need the comparison fields, so this stays a narrow
 * shape rather than the first-party `PageAudit`. Keeping them separate is what
 * lets the first-party crawler grow its Phase 0 evidence fields without
 * dragging a third-party crawl into storing page bodies it has no use for.
 *
 * Headings, schema types and a page type were added for the competitor
 * comparison (Phase 4.1): they say what a page is about and what it marks up,
 * which is what a topic or structured-data gap is measured on. Language,
 * hreflang and address countries say which market it serves. Still no body.
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
  /** <html lang>, for the market it serves. */
  language: string | null;
  /** hreflang alternates: the regional versions it publishes. */
  hreflang: string[];
  /** addressCountry values from its JSON-LD. */
  addressCountries: string[];
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
  /** The pages chosen, with why, homepage first. */
  selection: SelectedPage[];
};

export type CompetitorCrawlOptions = {
  /** Pages to fetch, homepage included. */
  limit: number;
  /** The competitor's results in your searches: its most relevant pages. */
  serp: Array<{ url: string; query: string; position: number }>;
  /** Words of your searches and business, to rank its other pages. */
  terms: ReadonlySet<string>;
  onSelection?: (selection: SelectedPage[]) => Promise<void>;
  onPage?: (audit: CompetitorPageAudit, selection: SelectedPage) => Promise<void>;
};

export async function crawlCompetitor(domain: string, options: CompetitorCrawlOptions): Promise<CompetitorCrawlResult> {
  const origin = `https://${hostKey(domain)}`;

  // Layer 0: never even start on a host that fails the SSRF rules.
  const entry = await assertSafeUrl(origin);
  if (!entry.ok) {
    throw new NonRetryableError(`Blocked competitor URL (${entry.reason})`);
  }

  const limit = Math.max(1, Math.min(options.limit, MAX_PAGES));
  const startHost = hostKey(entry.url.hostname);
  const robots = await fetchRobots(entry.url.origin);
  if (robots.outcome === "unreachable") {
    throw new NonRetryableError(
      `robots.txt could not be fetched (${robots.error ?? "no answer"}). Crawlers must treat the site as closed until it answers.`,
    );
  }
  const allowed = (url: string) => {
    try {
      const parsed = new URL(url);
      return /^https?:$/.test(parsed.protocol) && !isPathDisallowed(parsed.pathname, robots.group);
    } catch {
      return false;
    }
  };
  const homeUrl = entry.url.toString();
  if (!allowed(homeUrl)) {
    throw new NonRetryableError("robots.txt disallows crawling this site.");
  }
  const sitemap = robots.sitemapUrl ? (await fetchSitemapUrls(robots.sitemapUrl, startHost, SITEMAP_CANDIDATES)).filter(allowed) : [];
  const serp = options.serp.filter((row) => allowed(row.url));

  const pages: CompetitorPageAudit[] = [];
  const seen = new Set<string>();
  let blockedByRobots = 0;
  let selection: SelectedPage[] = [];
  let selected = false;

  // Declared before the crawler so the handlers below can queue into it.
  let crawler: CheerioCrawler | null = null;

  /** Chooses the pages once the homepage is in (or failed), and queues them. */
  const select = async (homepageUrl: string, links: Array<{ url: string; anchor: string }>) => {
    if (selected) return;
    selected = true;
    selection = selectCompetitorPages({ homepageUrl, serp, links, sitemap, terms: options.terms, limit }).filter((page) => allowed(page.url));
    await options.onSelection?.(selection);
    const rest = selection.slice(1);
    if (rest.length > 0 && crawler) {
      await crawler.addRequests(rest.map((page) => ({ url: page.url, uniqueKey: page.url, userData: { selection: page } })));
    }
  };

  crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: limit,
      maxConcurrency: 1,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 30,
      preNavigationHooks: [
        async ({ request }, gotOptions) => {
          // Layer 1: validate every request before it is made.
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
      async requestHandler({ $, request, response }) {
        const isHome = request.userData?.home === true;
        const loadedUrl = normalizePageUrl(request.loadedUrl ?? request.url) ?? request.url;
        if (seen.has(loadedUrl)) {
          if (isHome) await select(loadedUrl, []);
          return;
        }
        seen.add(loadedUrl);

        const loaded = new URL(loadedUrl);
        if (isPathDisallowed(loaded.pathname, robots.group)) {
          blockedByRobots += 1;
          if (isHome) await select(loadedUrl, []);
          return;
        }

        const { audit, links } = extractAudit($, loadedUrl, loaded, response);
        pages.push(audit);
        if (isHome) {
          await select(loadedUrl, links);
          await options.onPage?.(audit, selection[0] ?? { url: loadedUrl, source: "homepage", reason: "Homepage", pageType: "homepage", score: 1 });
          return;
        }
        const chosen = request.userData?.selection as SelectedPage | undefined;
        await options.onPage?.(audit, chosen ?? { url: loadedUrl, source: "link", reason: "Selected page", pageType: audit.pageType, score: 0 });
      },
      async failedRequestHandler({ request }) {
        console.error(`[competitor-crawl] failed ${request.url}`);
        // Without its homepage, still analyze the pages search results and
        // the sitemap point to.
        if (request.userData?.home === true) await select(homeUrl, []);
      },
    },
    new Configuration({ persistStorage: false, systemInfoV2: false }),
  );

  await crawler.run([{ url: homeUrl, uniqueKey: homeUrl, userData: { home: true } }]);

  if (pages.length === 0) {
    throw new NonRetryableError(`Could not fetch any pages from ${domain}`);
  }

  return { pages, robots, blockedByRobots, selection };
}

/** Cheerio's API as crawlee hands it to us, without depending on cheerio directly. */
type CheerioApi = CheerioCrawlingContext["$"];

/** addressCountry values anywhere in a JSON-LD block, e.g. a PostalAddress. */
function addressCountriesOf(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => addressCountriesOf(item, depth + 1));
  const record = value as Record<string, unknown>;
  const found: string[] = [];
  const country = record.addressCountry;
  if (typeof country === "string" && country.trim()) found.push(country.trim().slice(0, 60));
  if (country && typeof country === "object" && typeof (country as Record<string, unknown>).name === "string") {
    found.push(String((country as Record<string, unknown>).name).trim().slice(0, 60));
  }
  for (const [key, nested] of Object.entries(record)) {
    if (key !== "addressCountry" && nested && typeof nested === "object") found.push(...addressCountriesOf(nested, depth + 1));
  }
  return found;
}

function extractAudit(
  $: CheerioApi,
  loadedUrl: string,
  loaded: URL,
  response: { statusCode?: number; headers?: Record<string, unknown> } | undefined,
): { audit: CompetitorPageAudit; links: Array<{ url: string; anchor: string }> } {
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
  const links: Array<{ url: string; anchor: string }> = [];
  let internalLinks = 0;
  for (const anchor of $("a[href]").toArray()) {
    const href = $(anchor).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const target = normalizePageUrl(new URL(href, loaded).toString());
      if (!target || hostKey(new URL(target).hostname) !== originHost) continue;
      internalLinks += 1;
      if (links.length < MAX_LINKS) links.push({ url: target, anchor: clean($(anchor).text()).slice(0, 120) });
    } catch {
      // Not a usable link.
    }
  }

  const language = clean($("html").attr("lang")) || clean($('meta[http-equiv="content-language"]').attr("content")) || null;
  const hreflang = [
    ...new Set(
      $('link[rel="alternate"][hreflang]')
        .toArray()
        .map((node) => clean($(node).attr("hreflang")))
        .filter((value) => value && value.toLowerCase() !== "x-default"),
    ),
  ].slice(0, 60);

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
  const schemaJson = schemaScripts.flatMap((script) => {
    try {
      return [JSON.parse($(script).text()) as unknown];
    } catch {
      return [];
    }
  });
  const schemaTypes = [...new Set(schemaJson.flatMap((json) => schemaTypesOf(json)))];
  const addressCountries = [...new Set(schemaJson.flatMap((json) => addressCountriesOf(json)))].slice(0, 10);

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

  const audit: CompetitorPageAudit = {
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
    language,
    hreflang,
    addressCountries,
  };
  return { audit, links };
}
