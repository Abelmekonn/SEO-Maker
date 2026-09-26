import { assertSafeUrl, createSafeUrlCache, guardedLookup, safeFetch } from "@seo-maker/core/net";
import {
  type CrawlTier,
  type InventoryEntry,
  type InventorySummary,
  type PriorEvidence,
  UrlInventory,
  canonicalPointsElsewhere,
  hostKey,
  normalizePageUrl,
  pathDepth,
  sectionOf,
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
  fetchRobotsTxt,
  groupFor,
  isPathDisallowed,
} from "@seo-maker/core/robots";
import {
  type SitemapAudit,
  type SitemapDocument,
  type SitemapUrlEvidence,
  buildSitemapAudit,
  parseSitemapXml,
} from "@seo-maker/core/sitemap";
import { CheerioCrawler, type CheerioCrawlingContext, Configuration, NonRetryableError } from "crawlee";
import { extractPage } from "./extract.js";

export { normalizePageUrl } from "@seo-maker/core/crawl";

/**
 * First-party site crawler.
 *
 * Rewritten to close defects found by crawling stripe.com end to end:
 *
 *  - the 100-page budget was spent in sitemap document order, which put 72 of
 *    73 pages under /legal and never reached a product page;
 *  - word counts included <script> text, inflating them ~6.5x and disabling
 *    the thin-content check on every page of every site (now `extractPage`);
 *  - failed fetches were never written, so the database always reported zero
 *    failures no matter how many requests errored;
 *  - redirects were invisible: `finalUrl` was assigned a copy of `url`;
 *  - robots.txt was scanned only for a `Sitemap:` line, so Disallow was ignored;
 *  - the SSRF guards in core were wired into the competitor crawler only, and
 *    the first-party path could reach private addresses.
 *
 * Discovering a site and crawling it are separate steps:
 *
 *   discoverSite  robots.txt + sitemaps + the homepage's links -> inventory
 *                 -> Priority / Standard classification (`UrlInventory`).
 *                 Fetches the homepage and nothing else.
 *   crawlPages    fetches exactly the pages chosen from that inventory, each
 *                 at the tier it was classified at. It follows no links and
 *                 ranks nothing, so a crawl never re-classifies a page.
 *
 * Priority pages keep full Page Intelligence evidence; Standard pages keep
 * what the inventory and the deterministic checks need.
 */

const MAX_SITEMAP_DOCUMENTS = 50;
const MAX_SITEMAP_URLS = 10_000;
export const USER_AGENT = "SEO-Maker-Bot/0.1 (+https://seo-maker.app/bot)";

/** Request slack above the page count, to absorb URLs that redirect onto a known page. */
const REQUEST_SLACK = 1.4;

/** Prefix of the error that stops a redirect into a path robots.txt disallows. */
export const ROBOTS_REDIRECT = "Blocked by robots.txt:";

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
  /** Page text. Null on a Standard Crawl, which keeps only its word count and fingerprint. */
  content: string | null;
  contentHash: string;
  evidence: PageEvidence;
  tier: CrawlTier;
  status: "analyzed";
};

export type DiscoveredVia = "seed" | "sitemap" | "link" | "user";

/** A fetch that never produced a page. Recorded so failures stop disappearing. */
export type PageFailure = {
  url: string;
  statusCode: number | null;
  errorType: string;
  error: string;
  discoveredVia: DiscoveredVia;
  depth: number;
  tier: CrawlTier;
  status: "failed";
};

export type CrawlSiteResult = {
  pages: PageAudit[];
  failures: PageFailure[];
  robotsAudit: RobotsAudit;
  sitemapAudit: SitemapAudit;
  /** URL sections the fetched pages cover. */
  sections: string[];
  /** What became of the sitemap's own entries, for the crawl summary. */
  sitemapStats: { duplicates: number; disallowed: number; offSite: number };
  /** Requests actually spent, which exceeds `pages` when URLs redirect onto each other. */
  requests: number;
  /** Chosen URLs deliberately not analyzed: robots.txt, off the site, duplicates after redirect. */
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

/** Where a crawl is, for the live progress view. */
export type CrawlPhase = "discovering" | "crawling";

/** What the crawl will do, known once robots.txt and the sitemaps are read. */
export type CrawlPlanInfo = {
  /** URLs the crawl will fetch. The progress bar's denominator. */
  seeds: number;
  sections: number;
  sitemapUrls: number;
  robotsFound: boolean;
  /** Seconds between requests when robots.txt asks for it, else 0. */
  crawlDelay: number;
  concurrency: number;
  /** Chosen pages fetched with a Priority Crawl. */
  priority: number;
  /** Chosen pages fetched with a Standard Crawl. */
  standard: number;
  /** Chosen pages not fetched: robots.txt disallows them now, or they left the site. */
  blocked: number;
};

/** Business context that sharpens page-type classification (Deep mode). */
export type ClassifyContext = Pick<ClassifyInput, "offerings" | "offeringKind"> & {
  /** Page types the user set, by URL path. They win over classification. */
  overrides?: Record<string, string>;
};

export type CrawlHooks = {
  onPhase?: (phase: CrawlPhase) => Promise<void>;
  onPlan?: (plan: CrawlPlanInfo) => Promise<void>;
  onPage?: (audit: PageAudit) => Promise<void>;
  onFailure?: (failure: PageFailure) => Promise<void>;
  classify?: ClassifyContext;
  /** Aborts the crawl when the user stops it. */
  signal?: AbortSignal;
};

/** One page a crawl fetches, at the tier the inventory classified it at. */
export type CrawlTarget = {
  url: string;
  tier: CrawlTier;
  discoveredVia: DiscoveredVia;
};

/** Thrown when a crawl ends because the user stopped it, not because it broke. */
export class CrawlStoppedError extends Error {
  constructor() {
    super("The crawl was stopped.");
    this.name = "CrawlStoppedError";
  }
}

type RobotsGroup = ReturnType<typeof groupFor>;

/** Site-wide facts every step reads first: robots.txt and the sitemaps. */
type SiteFacts = {
  start: string;
  origin: string;
  siteHost: string;
  group: RobotsGroup;
  robotsAudit: RobotsAudit;
  sitemap: SitemapRead;
  /** Eligible or blocked sitemap URLs, normalized, in sitemap order. */
  sitemapUrls: string[];
  sitemapSet: Set<string>;
  hasSitemap: boolean;
  /** The sitemap URLs, and later anything else discovery finds. */
  inventory: UrlInventory;
  crawlDelay: number;
  concurrency: number;
};

async function readSite(startUrl: string, throwIfStopped: () => void): Promise<SiteFacts> {
  const start = normalizePageUrl(startUrl);
  if (!start) {
    throw new NonRetryableError(`Invalid start URL: ${startUrl}`);
  }

  // Layer 0 of the SSRF defense: refuse the site before any request is made.
  const entry = await assertSafeUrl(start);
  if (!entry.ok) {
    throw new NonRetryableError(`Blocked start URL (${entry.reason}): ${entry.detail}`);
  }
  const origin = entry.url.origin;
  const siteHost = hostKey(entry.url.hostname);

  // RFC 9309: redirects followed, 4xx means no rules, 5xx or no answer means
  // "unreachable". The RFC then treats the whole site as disallowed. This is
  // the user's own site and they asked for its audit, so the crawl goes on
  // and the audit reports the failure prominently instead: a robots.txt that
  // does not answer is itself one of the most serious findings there is.
  const robots = await fetchRobotsTxt(origin, { userAgent: USER_AGENT, timeoutMs: 10_000 });
  throwIfStopped();
  if (robots.outcome !== "ok") {
    console.warn(`[robots] ${robots.url}: ${robots.outcome}${robots.problem ? ` (${robots.problem})` : ""}${robots.error ? `: ${robots.error}` : ""}`);
  }
  const group = robots.parsed ? groupFor(robots.parsed) : null;
  const sitemap = await readSitemaps(robots.parsed?.sitemaps ?? [], origin);
  throwIfStopped();

  // Discovery -> eligibility -> inventory. The sitemap is read whole before
  // anything is fetched, so the inventory starts from the site's full URL list.
  const hasSitemap = sitemap.documents.some((doc) => doc.ok);
  const inventory = new UrlInventory({
    start,
    siteHost,
    isDisallowed: (pathname) => isPathDisallowed(pathname, group),
    hasSitemap,
  });
  for (const loc of sitemap.locs) {
    inventory.add(loc, "sitemap");
  }
  const sitemapUrls = inventory.sitemapUrls();
  const crawlDelay =
    group?.crawlDelay && group.crawlDelay > 0 ? Math.min(group.crawlDelay, MAX_CRAWL_DELAY_SECS) : 0;
  const robotsAudit = buildRobotsAudit({
    url: robots.url,
    status: robots.status,
    parsed: robots.parsed,
    group,
    sitemapUrls: sitemapUrls.slice(0, 2000),
    fetch: robots,
  });

  if (robotsAudit.blocksEverything) {
    throw new NonRetryableError("robots.txt disallows crawling this site.");
  }

  return {
    start,
    origin,
    siteHost,
    group,
    robotsAudit,
    sitemap,
    sitemapUrls,
    sitemapSet: new Set(sitemapUrls),
    hasSitemap,
    inventory,
    crawlDelay,
    concurrency: crawlDelay ? 1 : crawlConcurrency(),
  };
}

function stopCheck(signal: AbortSignal | undefined) {
  return () => {
    if (signal?.aborted) throw new CrawlStoppedError();
  };
}

/** One fetched page, as the checks and the inventory see it. */
export type AuditInput = {
  $: CheerioCrawlingContext["$"];
  requestedUrl: string;
  loadedUrl: string;
  statusCode: number | null;
  headers: Record<string, string | string[] | undefined>;
  tier: CrawlTier;
  classify?: ClassifyContext;
  /** Crawl-level facts every page row carries. */
  site: {
    robotsTxtUrl: string | null;
    robotsOk: boolean;
    sitemapUrl: string | null;
    hasSitemap: boolean;
    inSitemap: boolean | null;
    robotsDisallowed: boolean;
  };
  depth?: number | null;
  discoveredVia: DiscoveredVia;
};

/**
 * Builds a page's audit from its HTML: extraction, page type, search intent,
 * indexability and redirect evidence. Shared by the crawl, discovery's read
 * of the homepage and the single-page fetch, so one page gets the same
 * record whichever of them fetched it.
 */
export function auditPage(input: AuditInput): { audit: PageAudit; discovered: string[] } {
  const { requestedUrl, loadedUrl, statusCode, tier } = input;
  const loaded = new URL(loadedUrl);
  const extracted = extractPage(input.$, loadedUrl, tier);
  const xRobotsTag = input.headers["x-robots-tag"]?.toString()?.toLowerCase() ?? null;
  const noindex =
    (extracted.robotsMeta?.includes("noindex") ?? false) || (xRobotsTag?.includes("noindex") ?? false);

  const override = input.classify?.overrides?.[loaded.pathname || "/"];
  const classified = classifyPage({
    url: loadedUrl,
    title: extracted.title,
    h1: extracted.h1,
    schemaTypes: extracted.schemaTypes,
    wordCount: extracted.wordCount,
    offerings: input.classify?.offerings,
    offeringKind: input.classify?.offeringKind,
  });
  // The user's own statement of what a page is outranks every heuristic.
  const classification = override
    ? { type: override as typeof classified.type, confidence: 1, evidence: ["Set by you"] }
    : classified;
  const intent = inferSearchIntent({ pageType: classification.type, title: extracted.title, h1: extracted.h1 });
  const redirected = loadedUrl !== requestedUrl;

  return {
    discovered: extracted.discovered,
    audit: {
      url: loadedUrl,
      // Set only when the URL we asked for is not the one that answered, so
      // `finalUrl` means "this redirected" rather than repeating `url`. It
      // used to be assigned a copy of `url`, so no page on any site ever
      // recorded a redirect.
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
      robotsTxtUrl: input.site.robotsTxtUrl,
      robotsOk: input.site.robotsOk,
      sitemapUrl: input.site.sitemapUrl,
      hasSitemap: input.site.hasSitemap,
      xRobotsTag,
      robotsMeta: extracted.robotsMeta,
      indexable: !noindex && (statusCode ?? 0) < 400,
      inSitemap: input.site.inSitemap,
      robotsDisallowed: input.site.robotsDisallowed,
      pageType: classification.type,
      pageTypeScore: classification.confidence,
      searchIntent: intent.intent,
      searchIntentScore: intent.intent ? intent.confidence : null,
      language: extracted.language,
      depth: input.depth ?? pathDepth(loadedUrl),
      discoveredVia: input.discoveredVia,
      redirectCount: redirected ? 1 : 0,
      responseTimeMs: null,
      contentType: input.headers["content-type"]?.toString() ?? null,
      // A Standard Crawl reads the text for its word count and fingerprint,
      // then lets it go.
      content: tier === "priority" ? extracted.content : null,
      contentHash: contentFingerprint(extracted.content),
      evidence: {
        ...extracted.evidence,
        redirectChain: redirected ? [{ from: requestedUrl, to: loadedUrl, status: statusCode ?? 301 }] : [],
      },
      tier,
      status: "analyzed",
    },
  };
}

/**
 * The request guards every first-party fetch uses: SSRF checks on the URL, at
 * connect time and on every redirect hop, and robots.txt on redirect targets.
 */
export function guardRequests(options: { siteHost: string; group: RobotsGroup }) {
  // One DNS verdict per host per crawl. Without this, the per-request lookup
  // floods the resolver and its transient failures surface as blocked pages.
  const safeUrls = createSafeUrlCache();
  return async (
    { request }: { request: { url: string } },
    gotOptions?: {
      dnsLookup?: unknown;
      maxRedirects?: number;
      timeout?: unknown;
      headers?: Record<string, unknown>;
      hooks?: Record<string, unknown>;
    },
  ) => {
    // Layer 1: validate every URL.
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
    if (!gotOptions) return;
    // Layer 2: the DNS-rebinding defense. Resolves at connect time against
    // the address the socket actually uses, so a TTL-0 flip between
    // validation and fetch is still caught.
    gotOptions.dnsLookup = guardedLookup;
    gotOptions.maxRedirects = 5;
    gotOptions.timeout = { request: 25_000 };
    gotOptions.headers = { ...(gotOptions.headers ?? {}), "user-agent": USER_AGENT };
    // Layer 3: re-validate each redirect hop rather than trusting got.
    gotOptions.hooks = {
      ...(gotOptions.hooks ?? {}),
      beforeRedirect: [
        async (redirect: { url?: URL | string }) => {
          const target = redirect.url;
          if (!target) return;
          const href = typeof target === "string" ? target : target.toString();
          const hop = await safeUrls.check(href);
          if (!hop.ok) {
            throw new NonRetryableError(`Blocked redirect (${hop.reason})`);
          }
          // robots.txt covers every URL we fetch, redirect targets included:
          // a redirect into a disallowed path is not followed.
          let next: URL | null = null;
          try {
            next = new URL(href);
          } catch {
            next = null;
          }
          if (next && hostKey(next.hostname) === options.siteHost && isPathDisallowed(next.pathname, options.group)) {
            throw new NonRetryableError(`${ROBOTS_REDIRECT} ${href}`);
          }
        },
      ],
    };
  };
}

export type DiscoveryOptions = {
  classify?: ClassifyContext;
  /** The plan's cap on Priority pages. */
  priorityLimit: number;
  /** What the last crawl learned, by URL: page type, indexability, links. */
  prior?: Map<string, PriorEvidence>;
  signal?: AbortSignal;
};

export type DiscoveryResult = {
  /** Every URL found, most important first, classified with the plan's Priority cap applied. */
  entries: InventoryEntry[];
  summary: InventorySummary;
  sitemapUrls: number;
  robotsFound: boolean;
  /** Why the homepage could not be read, when it could not: its links are then missing. */
  homepageError: string | null;
};

/**
 * Finds a site's pages and classifies them, without crawling them.
 *
 * Reads robots.txt and every sitemap, and fetches the homepage once for its
 * links: the site's own statement of what matters, and the only map of a
 * site with no sitemap. Nothing else is requested. Classification is
 * deterministic (`UrlInventory`): importance from the URL, the sitemap, the
 * homepage's links and what an earlier crawl learned, capped by the plan.
 */
export async function discoverSite(startUrl: string, options: DiscoveryOptions): Promise<DiscoveryResult> {
  const throwIfStopped = stopCheck(options.signal);
  const site = await readSite(startUrl, throwIfStopped);
  const { inventory } = site;
  inventory.setPrior(options.prior ?? new Map());

  const home = await readHomepage(site, options.classify);
  throwIfStopped();
  if (home.ok) {
    const loaded = home.audit.url;
    if (loaded !== site.start) {
      // Links from the page the homepage redirected to are homepage links.
      inventory.setHome(loaded);
    }
    inventory.observe(loaded, {
      tier: "standard",
      statusCode: home.audit.statusCode,
      indexable: home.audit.indexable,
      canonicalElsewhere: canonicalPointsElsewhere(loaded, home.audit.canonicalUrl),
      pageType: home.audit.pageType,
      typeConfidence: home.audit.pageTypeScore,
      typeSetByUser: Boolean(options.classify?.overrides?.[new URL(loaded).pathname || "/"]),
    });
    for (const href of home.discovered) {
      inventory.add(href, "link", loaded);
    }
  } else if (site.sitemapUrls.length === 0) {
    // No sitemap and no homepage: there is nothing to discover from.
    throw new Error(`Could not read ${site.start}: ${home.reason}`);
  }

  const priorityLimit = Math.max(0, Math.floor(options.priorityLimit));
  const entries = inventory.snapshot({
    classify: { offerings: options.classify?.offerings, offeringKind: options.classify?.offeringKind },
    typeOverrides: options.classify?.overrides,
    priorityLimit,
    stage: "plan",
  });
  return {
    entries,
    summary: inventory.summary({ priorityLimit, maxPages: 0 }),
    sitemapUrls: site.sitemapUrls.length,
    robotsFound: site.robotsAudit.found,
    homepageError: home.ok ? null : home.reason,
  };
}

/** The homepage, fetched once for discovery: its links and what the page is. */
async function readHomepage(
  site: SiteFacts,
  classify: ClassifyContext | undefined,
): Promise<{ ok: true; audit: PageAudit; discovered: string[] } | { ok: false; reason: string }> {
  let result: { ok: true; audit: PageAudit; discovered: string[] } | { ok: false; reason: string } = {
    ok: false,
    reason: "the homepage did not answer",
  };
  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: 1,
      maxConcurrency: 1,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 30,
      preNavigationHooks: [guardRequests({ siteHost: site.siteHost, group: site.group })],
      async requestHandler({ $, request, response }) {
        const requestedUrl = normalizePageUrl(request.url) ?? request.url;
        const loadedUrl = normalizePageUrl(request.loadedUrl ?? request.url) ?? requestedUrl;
        if (hostKey(new URL(loadedUrl).hostname) !== site.siteHost) {
          result = { ok: false, reason: `the homepage redirects off the site, to ${new URL(loadedUrl).hostname}` };
          return;
        }
        result = {
          ok: true,
          ...auditPage({
            $,
            requestedUrl,
            loadedUrl,
            statusCode: response?.statusCode ?? null,
            headers: response?.headers ?? {},
            tier: "standard",
            classify,
            site: {
              robotsTxtUrl: site.robotsAudit.finalUrl ?? site.robotsAudit.url,
              robotsOk: site.robotsAudit.found,
              sitemapUrl: site.sitemap.primaryUrl,
              hasSitemap: site.hasSitemap,
              inSitemap: site.hasSitemap ? site.sitemapSet.has(loadedUrl) : null,
              robotsDisallowed: false,
            },
            discoveredVia: "seed",
          }),
        };
      },
      async failedRequestHandler({ response }, error) {
        result = {
          ok: false,
          reason: response?.statusCode
            ? `the homepage answered HTTP ${response.statusCode}`
            : `the homepage could not be fetched (${classifyError(error, null)})`,
        };
      },
    },
    new Configuration({ persistStorage: false, systemInfoV2: false }),
  );
  await crawler.run([{ url: site.start, uniqueKey: site.start }]);
  return result;
}

/**
 * Crawls exactly the pages chosen from the site's inventory.
 *
 * Each target is fetched at the tier it was classified at, and nothing else
 * is: links on the pages are not followed and no page is ranked, so what is
 * crawled is what the user chose. robots.txt and the sitemaps are read again
 * because the checks need them as they are today, and a page robots.txt now
 * disallows is not fetched, whatever was chosen.
 */
export async function crawlPages(startUrl: string, targets: CrawlTarget[], hooks?: CrawlHooks): Promise<CrawlSiteResult> {
  const signal = hooks?.signal;
  const throwIfStopped = stopCheck(signal);

  await hooks?.onPhase?.("discovering");
  const site = await readSite(startUrl, throwIfStopped);
  const { group, sitemap, sitemapSet, siteHost, robotsAudit, crawlDelay, concurrency } = site;

  // Each target once, normalized, on this site and allowed by robots.txt.
  const chosen = new Map<string, CrawlTarget>();
  let skipped = 0;
  for (const target of targets) {
    const url = normalizePageUrl(target.url);
    if (!url || chosen.has(url)) continue;
    const parsed = new URL(url);
    if (hostKey(parsed.hostname) !== siteHost || isPathDisallowed(parsed.pathname, group)) {
      skipped += 1;
      continue;
    }
    chosen.set(url, { ...target, url });
  }
  const blocked = skipped;
  if (chosen.size === 0) {
    throw new NonRetryableError("None of the chosen pages can be crawled: robots.txt disallows them, or they are not on this site.");
  }

  const queue = [...chosen.values()];
  const priority = queue.filter((target) => target.tier === "priority").length;
  await hooks?.onPlan?.({
    seeds: queue.length,
    sections: new Set(queue.map((target) => sectionOf(target.url))).size,
    sitemapUrls: site.sitemapUrls.length,
    robotsFound: robotsAudit.found,
    crawlDelay,
    concurrency,
    priority,
    standard: queue.length - priority,
    blocked,
  });

  const siteFacts = {
    robotsTxtUrl: robotsAudit.finalUrl ?? robotsAudit.url,
    robotsOk: robotsAudit.found,
    sitemapUrl: sitemap.primaryUrl,
    hasSitemap: robotsAudit.hasSitemapDirective || site.hasSitemap,
  };

  const pages: PageAudit[] = [];
  const failures: PageFailure[] = [];
  const seen = new Set<string>();
  let requests = 0;

  const targetOf = (url: string): CrawlTarget | undefined => chosen.get(normalizePageUrl(url) ?? url);
  const tierOf = (url: string, fallback: unknown): CrawlTier =>
    targetOf(url)?.tier ?? (fallback === "standard" ? "standard" : "priority");

  const crawler = new CheerioCrawler(
    {
      // Slack above the page count absorbs URLs that 301 onto a page we
      // already hold: they cost a request but are not new pages.
      maxRequestsPerCrawl: Math.ceil(queue.length * REQUEST_SLACK) + 1,
      // A site that sets Crawl-delay gets one request at a time, that far apart.
      maxConcurrency: concurrency,
      ...(crawlDelay ? { sameDomainDelaySecs: crawlDelay } : {}),
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 30,
      preNavigationHooks: [guardRequests({ siteHost, group })],

      async requestHandler({ $, request, response, crawler: self }) {
        requests += 1;
        // Requests already in flight when the user stopped the crawl finish
        // without being saved, so the count shown at the stop is the count kept.
        if (signal?.aborted) {
          await self.autoscaledPool?.abort();
          return;
        }

        const requestedUrl = normalizePageUrl(request.url) ?? request.url;
        const loadedUrl = normalizePageUrl(request.loadedUrl ?? request.url) ?? requestedUrl;
        const tier = tierOf(requestedUrl, request.userData?.tier);
        const statusCode = response?.statusCode ?? null;

        // Two chosen URLs that redirect onto one page are one page: the
        // second is evidence about the sitemap, not a new page.
        if (seen.has(loadedUrl)) {
          skipped += 1;
          if (requestedUrl !== loadedUrl && sitemapSet.has(requestedUrl)) {
            sitemap.evidence.push({ url: requestedUrl, statusCode, finalUrl: loadedUrl, indexable: null });
          }
          return;
        }

        const loaded = new URL(loadedUrl);
        // A redirect can leave the site entirely: stripe.com/bridge answers
        // from bridge.xyz. That is a fact about the sitemap, not a page of
        // this site, and storing it would audit someone else's domain.
        if (hostKey(loaded.hostname) !== siteHost) {
          skipped += 1;
          if (sitemapSet.has(requestedUrl)) {
            sitemap.evidence.push({ url: requestedUrl, statusCode, finalUrl: loadedUrl, indexable: null });
          }
          return;
        }
        if (isPathDisallowed(loaded.pathname, group)) {
          skipped += 1;
          return;
        }

        seen.add(loadedUrl);
        seen.add(requestedUrl);

        const { audit } = auditPage({
          $,
          requestedUrl,
          loadedUrl,
          statusCode,
          headers: response?.headers ?? {},
          tier,
          classify: hooks?.classify,
          site: {
            ...siteFacts,
            // Null when the site publishes no sitemap at all, which the
            // indexability rule reads as "cannot corroborate" rather than
            // "deliberately left out".
            inSitemap: site.hasSitemap ? sitemapSet.has(loadedUrl) : null,
            robotsDisallowed: isPathDisallowed(loaded.pathname, group),
          },
          discoveredVia: requestedUrl === site.start ? "seed" : (targetOf(requestedUrl)?.discoveredVia ?? "link"),
        });

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
        if (signal?.aborted) {
          return;
        }
        const url = normalizePageUrl(request.url) ?? request.url;
        const tier = tierOf(url, request.userData?.tier);
        const message = error instanceof Error ? error.message : String(error);

        // Stopped before following a redirect into a disallowed path. It was
        // never fetched.
        if (message.includes(ROBOTS_REDIRECT)) {
          skipped += 1;
          if (sitemapSet.has(url)) {
            const target = normalizePageUrl(message.slice(message.indexOf(ROBOTS_REDIRECT) + ROBOTS_REDIRECT.length).trim());
            sitemap.evidence.push({ url, statusCode: null, finalUrl: target, indexable: null });
          }
          return;
        }

        if (seen.has(url)) {
          return;
        }
        seen.add(url);

        const failure: PageFailure = {
          url,
          statusCode: response?.statusCode ?? null,
          errorType: classifyError(error, response?.statusCode ?? null),
          error: message.slice(0, 500),
          discoveredVia: url === site.start ? "seed" : (targetOf(url)?.discoveredVia ?? "link"),
          depth: pathDepth(url),
          tier,
          status: "failed",
        };

        failures.push(failure);
        if (sitemapSet.has(url)) {
          sitemap.evidence.push({ url, statusCode: failure.statusCode, finalUrl: null, indexable: null });
        }
        await hooks?.onFailure?.(failure);
      },
    },
    new Configuration({ persistStorage: false, systemInfoV2: false }),
  );

  throwIfStopped();
  await hooks?.onPhase?.("crawling");

  // Stopping aborts the pool: no new requests start, and run() returns once
  // the ones in flight settle.
  const onStop = () => void crawler.autoscaledPool?.abort();
  signal?.addEventListener("abort", onStop, { once: true });
  try {
    await crawler.run(queue.map((target) => ({ url: target.url, uniqueKey: target.url, userData: { tier: target.tier } })));
  } finally {
    signal?.removeEventListener("abort", onStop);
  }
  throwIfStopped();

  if (pages.length === 0 && failures.length === 0) {
    throw new Error(`Could not fetch any of the ${queue.length} chosen ${queue.length === 1 ? "page" : "pages"}.`);
  }

  const sitemapStats = site.inventory.sitemapSummary();
  return {
    pages,
    failures,
    robotsAudit,
    sitemapAudit: buildSitemapAudit({
      documents: sitemap.documents,
      urlCount: site.sitemapUrls.length,
      offSiteCount: sitemapStats.external,
      duplicateCount: sitemapStats.duplicate,
      disallowedCount: sitemapStats.blocked_by_robots,
      evidence: sitemap.evidence,
    }),
    sections: [...new Set([...pages.map((page) => page.url), ...failures.map((row) => row.url)].map(sectionOf))],
    sitemapStats: {
      duplicates: sitemapStats.duplicate,
      disallowed: sitemapStats.blocked_by_robots,
      offSite: sitemapStats.external,
    },
    requests,
    skipped,
  };
}

export function classifyError(error: unknown, status: number | null): string {
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

type SitemapRead = {
  documents: SitemapDocument[];
  /**
   * Every <loc> as written, in document order. The inventory sorts them into
   * eligible, blocked, off-site, duplicate, asset and invalid; filtering them
   * here, as this used to, left the sitemap audit reporting zero off-site and
   * zero duplicate entries on every site.
   */
  locs: string[];
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
async function readSitemaps(declared: string[], origin: string): Promise<SitemapRead> {
  const roots = declared.length > 0 ? declared : [`${origin}/sitemap.xml`];
  const documents: SitemapDocument[] = [];
  const locs: string[] = [];
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
      if (locs.length >= MAX_SITEMAP_URLS) {
        break;
      }
      locs.push(entry.loc);
    }
  }

  return { documents, locs, primaryUrl: roots[0] ?? null, evidence: [] };
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
