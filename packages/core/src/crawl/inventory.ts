import { type ClassifyInput, classifyPage } from "../page/classify";
import { pageImportance } from "../site/intelligence";
import { classifyUrl, hostKey, pageKeyOf, pathDepth, sectionOf } from "./url";

/**
 * The URL inventory and the Priority / Standard crawl plan.
 *
 *   discovery (robots.txt, sitemaps, links)
 *     -> eligibility      which URLs may be fetched at all
 *     -> inventory        every eligible or robots-blocked URL, with its signals
 *     -> type + importance deterministic, from crawl evidence only
 *     -> user adjustments the user's Priority / Standard choices, by path
 *     -> crawl plan       Priority Crawl, Standard Crawl, and what is deferred
 *
 * Priority Crawl collects the full page evidence Page Intelligence and AI
 * work from: page text, headings, links, images, structured data. Standard
 * Crawl still fetches the page, but keeps only what the site inventory and the
 * deterministic checks need, so a large site costs a fraction of the storage.
 * Both are crawling strategies, not product modes: Quick and Deep analysis are
 * unrelated and unchanged.
 *
 * Nothing here calls a model. Which URLs matter is decided from what the crawl
 * saw, and every decision carries the reasons behind it. `importance` is an
 * internal prioritization signal; it is not, and must never be shown as, a
 * search ranking score.
 */

export type UrlEligibility = "eligible" | "blocked_by_robots" | "invalid" | "duplicate" | "asset" | "external";

export const URL_ELIGIBILITIES: readonly UrlEligibility[] = [
  "eligible",
  "blocked_by_robots",
  "invalid",
  "duplicate",
  "asset",
  "external",
];

/** How a URL entered the inventory. "user" is a page the user asked to crawl. */
export type DiscoverySource = "seed" | "sitemap" | "link" | "user";

export type CrawlTier = "priority" | "standard";

export type ImportanceLevel = "high" | "medium" | "low" | "utility";

/** What an earlier crawl learned about a URL. */
export type PriorEvidence = {
  pageType: string | null;
  typeConfidence: number | null;
  indexable: boolean | null;
  statusCode: number | null;
  canonicalElsewhere: boolean;
  inlinks: number | null;
};

/** What fetching a URL in this crawl showed. */
export type FetchedEvidence = {
  tier: CrawlTier;
  statusCode: number | null;
  indexable: boolean | null;
  canonicalElsewhere: boolean;
  pageType: string;
  typeConfidence: number;
  /** True when the type came from the user rather than the page. */
  typeSetByUser?: boolean;
};

/** One inventory URL as stored with the crawl and shown before the next one. */
export type InventoryEntry = {
  url: string;
  /** Path and query: the key user choices are stored under. */
  path: string;
  homepage: boolean;
  eligibility: "eligible" | "blocked_by_robots";
  sources: DiscoverySource[];
  inSitemap: boolean;
  linkedFromHome: boolean;
  /** Distinct crawled pages linking here. */
  inlinks: number;
  depth: number;
  pageType: string;
  typeConfidence: number;
  typeSource: "url" | "page" | "user";
  indexable: boolean | null;
  statusCode: number | null;
  canonicalElsewhere: boolean;
  /** 0..1 internal prioritization signal (see `pageImportance`). Not a ranking score. */
  importance: number;
  level: ImportanceLevel;
  reasons: string[];
  /** The tier importance alone gives. */
  autoTier: CrawlTier;
  /** The user's choice, when they made one. */
  userTier: CrawlTier | null;
  /** The tier after the user's choice and the plan's Priority cap. Null when blocked. */
  tier: CrawlTier | null;
  /** How this crawl fetched it. Null when it was not fetched. */
  crawled: CrawlTier | null;
};

export type InventorySummary = {
  counts: Record<UrlEligibility, number>;
  /** A few examples of each URL that was not eligible, so the counts can be checked. */
  samples: Partial<Record<UrlEligibility, string[]>>;
  hasSitemap: boolean;
  priorityLimit: number;
  maxPages: number;
  /** Entries dropped from the stored list to bound its size. Always the least important. */
  truncated: number;
};

export type StoredInventory = InventorySummary & { entries: InventoryEntry[] };

export type SnapshotOptions = {
  /** Business context that sharpens URL-only classification (Deep mode). */
  classify?: Pick<ClassifyInput, "offerings" | "offeringKind">;
  /** Page types the user set, by pathname. */
  typeOverrides?: Record<string, string>;
  /** Priority / Standard choices the user made, by path. */
  tierOverrides?: Record<string, CrawlTier>;
  priorityLimit: number;
  /**
   * "plan": before fetching; link counts from the previous crawl are used
   * alongside this crawl's. "final": after; only this crawl's evidence counts,
   * so a signal never outlives the pages that produced it.
   */
  stage: "plan" | "final";
};

/**
 * Importance at or above which a page is `high`.
 *
 * Read against `pageImportance`: a top-level URL with no other signal scores
 * 0.55, or 0.60 when it is an about, article or docs page. `high` takes a
 * strong signal on top of that: a commercial page type (+0.15) or a real share
 * of the site's internal links (up to +0.3). The homepage is always `high`.
 */
export const HIGH_IMPORTANCE = 0.65;

/** A second-level URL with no other signal scores 0.42: `medium` is anything that prominent. */
export const MEDIUM_IMPORTANCE = 0.4;

/** Stored entries per crawl. A site larger than this keeps its most important URLs listed. */
export const MAX_INVENTORY_ENTRIES = 1000;

/** Largest share of the Standard budget one URL section may take, as in `planSeeds`. */
const STANDARD_SECTION_SHARE = 0.35;

const MAX_SAMPLES = 5;
const MAX_DISTINCT_TRACKED = 20_000;
const MAX_REASONS = 6;

const UTILITY_TYPES = new Set(["utility", "legal"]);

const LEVEL_RANK: Record<ImportanceLevel, number> = { high: 0, medium: 1, low: 2, utility: 3 };

/** Reasons `resolveTiers` writes, and rewrites on every resolution. */
const TIER_REASON = /^(Priority set by you|Standard set by you|Past the \d+-page Priority limit)$/;

type Candidate = {
  url: string;
  eligibility: "eligible" | "blocked_by_robots";
  sources: Set<DiscoverySource>;
  inSitemap: boolean;
  linkedFromHome: boolean;
  linkedFrom: Set<string>;
  prior: PriorEvidence | null;
  fetched: FetchedEvidence | null;
  /** Status of a fetch that produced no page. */
  failedStatus: number | null;
  crawled: CrawlTier | null;
};

/** Path and query of a URL: "/", "/pricing", "/search?q=x". */
export function pathKeyOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || "/"}${parsed.search}`;
  } catch {
    return url;
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function emptyCounts(): Record<UrlEligibility, number> {
  return { eligible: 0, blocked_by_robots: 0, invalid: 0, duplicate: 0, asset: 0, external: 0 };
}

/**
 * Every URL a crawl discovered, and what may be done with each.
 *
 * Built up as discovery proceeds: the start URL and the sitemap before any
 * fetch, then the links of every fetched page. A robots.txt block keeps a URL
 * in the inventory, marked, rather than dropping it: robots.txt says "do not
 * fetch", which is not the same as "not important" and not the same as
 * "noindex".
 */
export class UrlInventory {
  private readonly candidates = new Map<string, Candidate>();
  private readonly counts = emptyCounts();
  /** The same outcomes for sitemap entries alone, for the sitemap audit. */
  private readonly sitemapCounts = emptyCounts();
  private readonly samples: Partial<Record<UrlEligibility, string[]>> = {};
  /** Distinct non-page URLs already counted, so a link on every page counts once. */
  private readonly counted = new Set<string>();
  private readonly sitemapSeen = new Set<string>();
  private priorEvidence = new Map<string, PriorEvidence>();
  private readonly start: string;
  private home: string;

  constructor(
    private readonly options: {
      /** Normalized start URL. */
      start: string;
      /** `hostKey` of the site. */
      siteHost: string;
      /** True when robots.txt forbids fetching the path. */
      isDisallowed: (pathname: string) => boolean;
      /** Whether the site publishes a sitemap, so "not in the sitemap" means something. */
      hasSitemap: boolean;
    },
  ) {
    this.start = options.start;
    this.home = options.start;
    this.add(options.start, "seed");
  }

  /** The URL the homepage answered from, when it redirected. Links from it are homepage links. */
  setHome(url: string) {
    this.home = url;
    if (url !== this.start) {
      this.add(url, "seed");
    }
  }

  get hasSitemap() {
    return this.options.hasSitemap;
  }

  /**
   * Records a discovered URL and returns its eligibility.
   *
   * `from` is the fetched page the link was found on; it counts toward the
   * target's internal links.
   */
  add(raw: string, source: DiscoverySource, from?: string): UrlEligibility {
    const outcome = this.classify(raw, source, from);
    if (source === "sitemap") this.sitemapCounts[outcome] += 1;
    return outcome;
  }

  private classify(raw: string, source: DiscoverySource, from?: string): UrlEligibility {
    // Another site's URL is external whatever it points at, a file included.
    try {
      const parsed = new URL(raw);
      if ((parsed.protocol === "http:" || parsed.protocol === "https:") && hostKey(parsed.hostname) !== this.options.siteHost) {
        parsed.hash = "";
        return this.countOnce("external", parsed.toString());
      }
    } catch {
      // Not absolute: classifyUrl reports it as invalid below.
    }

    const verdict = classifyUrl(raw);
    if (verdict.reason !== null) {
      return this.countOnce(verdict.reason, raw.slice(0, 300));
    }
    const url = verdict.url;

    // A sitemap listing the same page twice (or two spellings of it) is a
    // sitemap defect. A page linked from many places is not.
    if (source === "sitemap") {
      if (this.sitemapSeen.has(url)) {
        this.counts.duplicate += 1;
        this.sample("duplicate", raw.slice(0, 300));
        return "duplicate";
      }
      this.sitemapSeen.add(url);
    }

    const existing = this.candidates.get(url);
    if (existing) {
      this.link(existing, source, from);
      return existing.eligibility;
    }

    const eligibility = this.options.isDisallowed(pathnameOf(url)) ? "blocked_by_robots" : "eligible";
    const candidate: Candidate = {
      url,
      eligibility,
      sources: new Set(),
      inSitemap: false,
      linkedFromHome: false,
      linkedFrom: new Set(),
      prior: null,
      fetched: null,
      failedStatus: null,
      crawled: null,
    };
    this.link(candidate, source, from);
    this.candidates.set(url, candidate);
    this.counts[eligibility] += 1;
    if (eligibility !== "eligible") {
      this.sample(eligibility, url);
    }
    return eligibility;
  }

  /** Marks a URL robots.txt blocks that a redirect tried to reach. It was not fetched. */
  addBlockedRedirect(url: string) {
    const candidate = this.candidates.get(url);
    if (candidate) {
      if (candidate.eligibility === "eligible") {
        candidate.eligibility = "blocked_by_robots";
        this.counts.eligible -= 1;
        this.counts.blocked_by_robots += 1;
        this.sample("blocked_by_robots", url);
      }
      return;
    }
    this.add(url, "link");
  }

  /** Evidence an earlier crawl recorded, keyed by normalized URL. */
  setPrior(prior: Map<string, PriorEvidence>) {
    for (const [url, evidence] of prior) {
      const candidate = this.candidates.get(url);
      if (candidate) {
        candidate.prior = evidence;
      }
    }
    this.priorEvidence = prior;
  }

  /** What fetching the URL showed. */
  observe(url: string, fetched: FetchedEvidence) {
    const candidate = this.candidates.get(url) ?? this.ensure(url);
    if (!candidate) return;
    candidate.fetched = fetched;
    candidate.crawled = fetched.tier;
  }

  /** Records that a URL was fetched, even when the fetch produced no page. */
  markCrawled(url: string, tier: CrawlTier, statusCode?: number | null) {
    const candidate = this.candidates.get(url);
    if (candidate) {
      candidate.crawled = tier;
      if (statusCode != null && !candidate.fetched) candidate.failedStatus = statusCode;
    }
  }

  get(url: string): { eligibility: UrlEligibility; crawled: CrawlTier | null; sources: DiscoverySource[] } | null {
    const candidate = this.candidates.get(url);
    return candidate
      ? { eligibility: candidate.eligibility, crawled: candidate.crawled, sources: [...candidate.sources] }
      : null;
  }

  /** Eligible or blocked URLs the sitemap listed, in sitemap order. */
  sitemapUrls(): string[] {
    return [...this.sitemapSeen];
  }

  /** What became of the sitemap's own entries. */
  sitemapSummary(): Record<UrlEligibility, number> {
    return { ...this.sitemapCounts };
  }

  summary(extra: { priorityLimit: number; maxPages: number; truncated?: number }): InventorySummary {
    return {
      counts: { ...this.counts },
      samples: Object.fromEntries(Object.entries(this.samples).map(([key, value]) => [key, [...value]])),
      hasSitemap: this.options.hasSitemap,
      priorityLimit: extra.priorityLimit,
      maxPages: extra.maxPages,
      truncated: extra.truncated ?? 0,
    };
  }

  /**
   * Every inventory URL with its type, importance, level, reasons and tier,
   * most important first. Pure over the evidence recorded so far: calling it
   * twice with the same options gives the same answer.
   */
  snapshot(options: SnapshotOptions): InventoryEntry[] {
    const candidates = [...this.candidates.values()];
    const inlinksOf = (candidate: Candidate) => {
      const current = candidate.linkedFrom.size;
      if (options.stage === "final") return current;
      return Math.max(current, candidate.prior?.inlinks ?? 0);
    };
    const maxInlinks = Math.max(0, ...candidates.map(inlinksOf));
    const anyLinkEvidence = maxInlinks > 0;

    const entries = candidates.map((candidate) =>
      this.describe(candidate, inlinksOf(candidate), maxInlinks, anyLinkEvidence, options),
    );
    entries.sort(compareEntries);
    resolveTiers(entries, options.priorityLimit);
    return entries;
  }

  private describe(
    candidate: Candidate,
    inlinks: number,
    maxInlinks: number,
    anyLinkEvidence: boolean,
    options: SnapshotOptions,
  ): InventoryEntry {
    const url = candidate.url;
    const path = pathKeyOf(url);
    // The root path alone: "/?p=2" is a listing that shares the homepage's
    // path, not a second homepage.
    const isHomepage = url === this.start || url === this.home || path === "/";
    const depth = pathDepth(url);
    const type = this.typeOf(candidate, options);

    const evidence = candidate.fetched ?? candidate.prior;
    const statusCode = candidate.fetched?.statusCode ?? candidate.failedStatus ?? candidate.prior?.statusCode ?? null;
    const indexable = evidence?.indexable ?? null;
    const canonicalElsewhere = evidence?.canonicalElsewhere ?? false;
    // A page that errors, asks not to be indexed, or names another URL as
    // canonical is not a search entry point, whatever else is true of it.
    const searchable = (statusCode ?? 0) >= 400 || indexable === false || canonicalElsewhere ? false : indexable;

    const importance = pageImportance({
      isHomepage,
      depth,
      inlinks,
      maxInlinks,
      pageType: type.pageType,
      indexable: searchable,
    });

    const level: ImportanceLevel = isHomepage
      ? "high"
      : UTILITY_TYPES.has(type.pageType)
        ? "utility"
        : importance >= HIGH_IMPORTANCE
          ? "high"
          : importance >= MEDIUM_IMPORTANCE
            ? "medium"
            : "low";

    const reasons: string[] = [];
    if (candidate.eligibility === "blocked_by_robots") reasons.push("Blocked by robots.txt, so it is not fetched");
    if (isHomepage) reasons.push("Homepage");
    if (!isHomepage && candidate.linkedFromHome) reasons.push("Linked from the homepage");
    if (inlinks >= 2) reasons.push(`Linked from ${inlinks} crawled pages`);
    if (!isHomepage && inlinks === 0 && anyLinkEvidence) reasons.push("No crawled page links here");
    if (!isHomepage) reasons.push(typeReason(type));
    if (type.pageType === "utility") reasons.push("Utility page: not a search entry point");
    if (type.pageType === "legal") reasons.push("Legal page: rarely a search entry point");
    if ((statusCode ?? 0) >= 400) reasons.push(`Answered HTTP ${statusCode}`);
    else if (indexable === false) reasons.push("Asks not to be indexed (noindex)");
    else if (canonicalElsewhere) reasons.push("Canonical points to another URL");
    if (!isHomepage) reasons.push(depth <= 1 ? "Top-level URL" : `${depth} levels deep`);
    if (this.options.hasSitemap) reasons.push(candidate.inSitemap ? "In the sitemap" : "Not in the sitemap");

    const userTier = options.tierOverrides?.[path] ?? null;

    return {
      url,
      path,
      homepage: isHomepage,
      eligibility: candidate.eligibility,
      sources: [...candidate.sources],
      inSitemap: candidate.inSitemap,
      linkedFromHome: candidate.linkedFromHome,
      inlinks,
      depth,
      pageType: type.pageType,
      typeConfidence: type.confidence,
      typeSource: type.source,
      indexable,
      statusCode,
      canonicalElsewhere,
      importance,
      level,
      reasons: reasons.slice(0, MAX_REASONS),
      autoTier: level === "high" ? "priority" : "standard",
      userTier: userTier === "priority" || userTier === "standard" ? userTier : null,
      tier: null,
      crawled: candidate.crawled,
    };
  }

  private typeOf(
    candidate: Candidate,
    options: SnapshotOptions,
  ): { pageType: string; confidence: number; source: InventoryEntry["typeSource"] } {
    if (candidate.fetched) {
      return {
        pageType: candidate.fetched.pageType,
        confidence: candidate.fetched.typeConfidence,
        source: candidate.fetched.typeSetByUser ? "user" : "page",
      };
    }
    const override = options.typeOverrides?.[pathnameOf(candidate.url)];
    if (override) {
      return { pageType: override, confidence: 1, source: "user" };
    }
    const fromUrl = classifyPage({
      url: candidate.url,
      offerings: options.classify?.offerings,
      offeringKind: options.classify?.offeringKind,
    });
    const prior = candidate.prior;
    // The last crawl read the page itself, which beats reading its URL.
    if (prior?.pageType && (prior.typeConfidence ?? 0) > fromUrl.confidence) {
      return { pageType: prior.pageType, confidence: prior.typeConfidence ?? 0, source: "page" };
    }
    return { pageType: fromUrl.type, confidence: fromUrl.confidence, source: "url" };
  }

  private ensure(url: string): Candidate | null {
    const eligibility = this.add(url, "link");
    return eligibility === "eligible" || eligibility === "blocked_by_robots" ? (this.candidates.get(url) ?? null) : null;
  }

  private link(candidate: Candidate, source: DiscoverySource, from?: string) {
    candidate.sources.add(source);
    if (source === "sitemap") candidate.inSitemap = true;
    if (!candidate.prior) candidate.prior = this.priorEvidence.get(candidate.url) ?? null;
    if (from && from !== candidate.url) {
      candidate.linkedFrom.add(from);
      if (from === this.home || from === this.start) candidate.linkedFromHome = true;
    }
  }

  private countOnce(reason: Exclude<UrlEligibility, "eligible" | "blocked_by_robots">, key: string): UrlEligibility {
    const id = `${reason}\u0000${key}`;
    if (!this.counted.has(id)) {
      if (this.counted.size < MAX_DISTINCT_TRACKED) this.counted.add(id);
      this.counts[reason] += 1;
      this.sample(reason, key);
    }
    return reason;
  }

  private sample(reason: UrlEligibility, value: string) {
    const list = (this.samples[reason] ??= []);
    if (list.length < MAX_SAMPLES && !list.includes(value)) list.push(value);
  }
}

function typeReason(type: { pageType: string; confidence: number; source: InventoryEntry["typeSource"] }): string {
  if (type.pageType === "other" || type.confidence < 0.5) {
    return type.source === "user" ? "Page type set by you" : "Page type unknown";
  }
  const label = `${type.pageType.charAt(0).toUpperCase()}${type.pageType.slice(1)} page`;
  if (type.source === "user") return `${label} (set by you)`;
  if (type.source === "page") return label;
  return `${label} (from its URL)`;
}

/**
 * Most important first. Ties go to the homepage's own links, then to
 * sitemap-listed and shallower URLs, then alphabetically, so the order is
 * stable for the same evidence.
 */
function compareEntries(a: InventoryEntry, b: InventoryEntry): number {
  return (
    Number(b.homepage) - Number(a.homepage) ||
    // Two homepage spellings (http:// as entered, https:// from the sitemap)
    // are one page: the address the crawl starts from takes the Priority
    // slot, or on a one-page plan the only page ends up Standard.
    Number(b.sources.includes("seed")) - Number(a.sources.includes("seed")) ||
    (a.eligibility === b.eligibility ? 0 : a.eligibility === "eligible" ? -1 : 1) ||
    LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
    b.importance - a.importance ||
    Number(b.linkedFromHome) - Number(a.linkedFromHome) ||
    b.inlinks - a.inlinks ||
    Number(b.inSitemap) - Number(a.inSitemap) ||
    a.depth - b.depth ||
    a.url.localeCompare(b.url)
  );
}

/**
 * Applies the user's choices and the plan's Priority cap, in place.
 *
 * Pages the user made Priority come first, then pages importance made
 * Priority, in rank order, up to `priorityLimit`. Nothing is promoted to fill
 * the cap: a site with two important pages gets two Priority pages. A URL
 * robots.txt blocks gets no tier, whatever anyone chose.
 */
export function resolveTiers(entries: InventoryEntry[], priorityLimit: number): InventoryEntry[] {
  const limit = Math.max(0, Math.floor(priorityLimit));
  const eligible = entries.filter((entry) => entry.eligibility === "eligible");
  const wanted = (entry: InventoryEntry) => (entry.userTier ?? entry.autoTier) === "priority";
  const ordered = [
    ...eligible.filter((entry) => entry.userTier === "priority"),
    ...eligible.filter((entry) => entry.userTier == null && entry.autoTier === "priority"),
  ];
  const chosen = new Set(ordered.slice(0, limit).map((entry) => entry.url));

  for (const entry of entries) {
    // Reasons from an earlier resolution describe choices that may have changed.
    entry.reasons = entry.reasons.filter((reason) => !TIER_REASON.test(reason));
    if (entry.eligibility !== "eligible") {
      entry.tier = null;
      continue;
    }
    entry.tier = chosen.has(entry.url) ? "priority" : "standard";
    if (entry.userTier) {
      entry.reasons.unshift(entry.userTier === "priority" ? "Priority set by you" : "Standard set by you");
    }
    if (wanted(entry) && entry.tier === "standard") {
      entry.reasons.unshift(`Past the ${limit}-page Priority limit`);
    }
  }
  return entries;
}

export type CrawlSelection = {
  /** URLs for Priority Crawl, most important first. */
  priority: string[];
  /** URLs for Standard Crawl, spread across the site's sections. */
  standard: string[];
  /** Eligible URLs left for a later crawl: over the page budget. */
  deferred: number;
  /** URL sections the selection covers. */
  sections: string[];
};

/**
 * What to fetch within `budget` pages, given resolved tiers.
 *
 * Priority pages first. The Standard budget goes in importance order, spread
 * across URL sections the way `planSeeds` spreads seeds: no section may take
 * more than a third of it while other sections still have candidates, so a
 * blog with 5,000 posts cannot crowd out the rest of the site.
 */
export function selectCrawl(
  entries: InventoryEntry[],
  options: { budget: number; exclude?: Set<string>; maxSectionShare?: number },
): CrawlSelection {
  const budget = Math.max(0, Math.floor(options.budget));
  const exclude = options.exclude ?? new Set<string>();
  const open = entries.filter((entry) => entry.eligibility === "eligible" && !exclude.has(entry.url));

  const priority = open
    .filter((entry) => entry.tier === "priority")
    .slice(0, budget)
    .map((entry) => entry.url);
  const left = budget - priority.length;

  const bySection = new Map<string, string[]>();
  for (const entry of open) {
    if (entry.tier !== "standard") continue;
    const section = sectionOf(entry.url);
    const bucket = bySection.get(section);
    if (bucket) bucket.push(entry.url);
    else bySection.set(section, [entry.url]);
  }

  const standard: string[] = [];
  const cap = Math.max(1, Math.ceil(left * (options.maxSectionShare ?? STANDARD_SECTION_SHARE)));
  const taken = new Map<string, number>();
  let progressed = true;
  while (standard.length < left && progressed) {
    progressed = false;
    for (const [section, urls] of bySection) {
      if (standard.length >= left) break;
      const used = taken.get(section) ?? 0;
      if (used >= cap || used >= urls.length) continue;
      standard.push(urls[used]);
      taken.set(section, used + 1);
      progressed = true;
    }
  }
  // Every section reached its share: spend what is left rather than waste it.
  for (const [section, urls] of bySection) {
    for (let index = taken.get(section) ?? 0; index < urls.length && standard.length < left; index += 1) {
      standard.push(urls[index]);
      taken.set(section, index + 1);
    }
  }

  const chosen = priority.length + standard.length;
  return {
    priority,
    standard,
    deferred: Math.max(0, open.length - chosen),
    sections: [...new Set([...priority, ...standard].map(sectionOf))],
  };
}

/**
 * The inventory as stored with a crawl, bounded in size.
 *
 * Fetched URLs and URLs the user chose are always kept; the rest are kept in
 * importance order up to the limit.
 */
export function toStoredInventory(entries: InventoryEntry[], summary: InventorySummary): StoredInventory {
  if (entries.length <= MAX_INVENTORY_ENTRIES) {
    return { ...summary, truncated: 0, entries };
  }
  const keep = new Set(
    entries.filter((entry) => entry.crawled != null || entry.userTier != null).map((entry) => entry.url),
  );
  for (const entry of entries) {
    if (keep.size >= MAX_INVENTORY_ENTRIES) break;
    keep.add(entry.url);
  }
  const kept = entries.filter((entry) => keep.has(entry.url));
  return { ...summary, truncated: entries.length - kept.length, entries: kept };
}

/** Reads a stored inventory back without trusting its shape. Null when absent. */
export function readInventory(value: unknown): StoredInventory | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<StoredInventory>;
  if (!Array.isArray(raw.entries)) return null;
  const entries = raw.entries.filter(
    (entry): entry is InventoryEntry =>
      Boolean(entry) && typeof entry === "object" && typeof (entry as InventoryEntry).url === "string",
  );
  return {
    counts: { ...emptyCounts(), ...(raw.counts ?? {}) },
    samples: raw.samples && typeof raw.samples === "object" ? raw.samples : {},
    hasSitemap: Boolean(raw.hasSitemap),
    priorityLimit: Number(raw.priorityLimit) || 0,
    maxPages: Number(raw.maxPages) || 0,
    truncated: Number(raw.truncated) || 0,
    entries,
  };
}

/** What a stored inventory tells the next crawl, keyed by URL. */
export function priorFromInventory(inventory: StoredInventory | null): Map<string, PriorEvidence> {
  const prior = new Map<string, PriorEvidence>();
  for (const entry of inventory?.entries ?? []) {
    prior.set(entry.url, {
      pageType: entry.pageType,
      typeConfidence: entry.typeConfidence,
      indexable: entry.indexable,
      statusCode: entry.statusCode,
      canonicalElsewhere: entry.canonicalElsewhere,
      inlinks: entry.inlinks,
    });
  }
  return prior;
}

/** Whether a page's canonical names a different URL than the one that answered. */
export function canonicalPointsElsewhere(url: string, canonicalUrl: string | null | undefined): boolean {
  if (!canonicalUrl) return false;
  const canonical = classifyUrl(canonicalUrl).url;
  const own = classifyUrl(url).url;
  return Boolean(canonical && own && canonical !== own);
}

export type PriorPageRow = {
  url: string;
  finalUrl: string | null;
  status: string;
  statusCode: number | null;
  pageType: string | null;
  pageTypeScore: number | null;
  indexable: boolean | null;
  canonicalUrl: string | null;
  inSitemap?: boolean | null;
  robotsDisallowed?: boolean | null;
};

/**
 * Prior evidence from a crawl's page rows, for crawls made before inventories
 * were stored. It carries no link counts: those need every page's links,
 * which this deliberately does not load.
 */
export function priorFromPages(pages: PriorPageRow[]): Map<string, PriorEvidence> {
  const prior = new Map<string, PriorEvidence>();
  for (const page of pages) {
    const live = page.finalUrl ?? page.url;
    const url = classifyUrl(live).url;
    if (!url) continue;
    const fetched = page.status === "analyzed" || page.status === "failed";
    prior.set(url, {
      pageType: fetched ? page.pageType : null,
      typeConfidence: fetched ? page.pageTypeScore : null,
      indexable: fetched ? page.indexable : null,
      statusCode: page.statusCode,
      canonicalElsewhere: canonicalPointsElsewhere(live, page.canonicalUrl),
      inlinks: null,
    });
  }
  return prior;
}

/** An inventory rebuilt from a crawl's page rows, when the crawl stored none. */
export function inventoryFromPages(
  pages: PriorPageRow[],
  options: { start: string; siteHost: string },
): StoredInventory {
  const inventory = new UrlInventory({
    start: options.start,
    siteHost: options.siteHost,
    isDisallowed: () => false,
    hasSitemap: pages.some((page) => page.inSitemap != null),
  });
  for (const page of pages) {
    const url = page.finalUrl ?? page.url;
    inventory.add(url, page.inSitemap ? "sitemap" : "link");
    if (page.robotsDisallowed) {
      const normalized = classifyUrl(url).url;
      if (normalized) inventory.addBlockedRedirect(normalized);
    }
  }
  inventory.setPrior(priorFromPages(pages));
  const entries = inventory.snapshot({ stage: "plan", priorityLimit: 0 });
  return toStoredInventory(entries, inventory.summary({ priorityLimit: 0, maxPages: 0 }));
}

/**
 * The next crawl's plan, as far as it can be known before it runs: the last
 * crawl's inventory with the user's current choices and plan cap applied.
 * The crawl itself re-discovers the site, so a URL that appeared since is
 * ranked then; every choice made here is honoured by path.
 */
export function previewCrawlPlan(
  inventory: StoredInventory,
  options: { tierOverrides?: Record<string, CrawlTier>; priorityLimit: number },
): InventoryEntry[] {
  const entries = inventory.entries.map((entry) => {
    const choice = options.tierOverrides?.[entry.path];
    return {
      ...entry,
      reasons: [...entry.reasons],
      userTier: choice === "priority" || choice === "standard" ? choice : null,
    };
  });
  entries.sort(compareEntries);
  return resolveTiers(entries, options.priorityLimit);
}

/**
 * The user's Priority choices as overrides: only where they differ from what
 * importance alone would pick, so the automatic plan keeps working for every
 * page the user did not touch.
 */
export function tierOverridesFor(
  entries: InventoryEntry[],
  priorityPaths: Iterable<string>,
): Record<string, CrawlTier> {
  const wanted = new Set(priorityPaths);
  const overrides: Record<string, CrawlTier> = {};
  for (const entry of entries) {
    if (entry.eligibility !== "eligible") continue;
    const tier: CrawlTier = wanted.has(entry.path) ? "priority" : "standard";
    if (tier !== entry.autoTier) overrides[entry.path] = tier;
  }
  return overrides;
}

/**
 * One page's stored classification: what the site's page inventory (SitePage)
 * keeps for each URL discovery found. Decided once, from discovery evidence,
 * and never recomputed by a crawl.
 */
export type ClassifiedPage = {
  url: string;
  pageKey: string;
  path: string;
  homepage: boolean;
  tier: CrawlTier;
  autoTier: CrawlTier;
  level: ImportanceLevel;
  pageType: string;
  reasons: string[];
  sources: DiscoverySource[];
  inSitemap: boolean;
};

/**
 * What one discovery found, stored on the project for the screens that show
 * it: the counts after a site's first discovery, and the pages a check for
 * new pages added, so the user can choose whether to crawl them.
 */
export type DiscoverySummary = {
  mode: "initial" | "new-pages";
  /** ISO time the discovery finished. */
  at: string;
  /** Pages in the inventory afterwards. */
  total: number;
  /** Pages this discovery classified, by tier. Initial: every page. New pages: the new ones. */
  priority: number;
  standard: number;
  /** new-pages: the pages it added, most important first. */
  added: Array<{ url: string; pageKey: string; path: string; tier: CrawlTier; pageType: string; level: ImportanceLevel }>;
  /** Pages added beyond the ones listed in `added`. */
  addedNotListed: number;
  sitemapUrls: number;
  robotsFound: boolean;
  /** Why the homepage could not be read, when it could not: its links are then missing. */
  homepageError: string | null;
  /** What else discovery found: blocked, duplicate, asset and external URLs. */
  counts: Record<UrlEligibility, number>;
};

function toClassified(entry: InventoryEntry, tier: CrawlTier): ClassifiedPage {
  return {
    url: entry.url,
    pageKey: pageKeyOf(entry.url),
    path: entry.path,
    homepage: entry.homepage,
    tier,
    autoTier: entry.autoTier,
    level: entry.level,
    pageType: entry.pageType,
    reasons: entry.reasons,
    sources: entry.sources,
    inSitemap: entry.inSitemap,
  };
}

/**
 * Pages that can be stored: eligible, one per page identity, most important
 * first, bounded like a stored inventory. Two spellings of one page (http and
 * https, with and without www) are one page; the more important one is kept.
 */
function storable(entries: InventoryEntry[]): InventoryEntry[] {
  const seen = new Set<string>();
  const kept: InventoryEntry[] = [];
  for (const entry of entries) {
    if (entry.eligibility !== "eligible") continue;
    const key = pageKeyOf(entry.url);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
    if (kept.length >= MAX_INVENTORY_ENTRIES) break;
  }
  return kept;
}

/**
 * A site's first classification: every page discovery found, with the tier
 * `resolveTiers` gave it (the snapshot's own, so the plan's Priority cap and
 * any choice the user made are already applied). URLs robots.txt blocks are
 * left out: they cannot be crawled, so they are not pages of the inventory.
 */
export function classifyInventory(entries: InventoryEntry[]): ClassifiedPage[] {
  return storable(entries).map((entry) => toClassified(entry, entry.tier ?? "standard"));
}

/**
 * Classifies only the pages that are not known yet.
 *
 * Known pages keep the tier they have; nothing here reads or changes them.
 * A new page is Priority when its importance alone makes it Priority and the
 * plan's Priority cap still has room once the known Priority pages are
 * counted, most important first. Everything else new is Standard.
 */
export function classifyNewPages(
  entries: InventoryEntry[],
  options: { knownKeys: Set<string>; knownPriority: number; priorityLimit: number },
): ClassifiedPage[] {
  let room = Math.max(0, Math.floor(options.priorityLimit) - options.knownPriority);
  const limit = Math.max(0, Math.floor(options.priorityLimit));
  return storable(entries)
    .filter((entry) => !options.knownKeys.has(pageKeyOf(entry.url)))
    .map((entry) => {
      const reasons = entry.reasons.filter((reason) => !TIER_REASON.test(reason));
      let tier: CrawlTier = "standard";
      if (entry.autoTier === "priority") {
        if (room > 0) {
          tier = "priority";
          room -= 1;
        } else {
          reasons.unshift(`Past the ${limit}-page Priority limit`);
        }
      }
      return toClassified({ ...entry, reasons }, tier);
    });
}

/** Reads the stored overrides column without trusting its shape. */
export function readTierOverrides(value: unknown): Record<string, CrawlTier> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const overrides: Record<string, CrawlTier> = {};
  for (const [path, tier] of Object.entries(value as Record<string, unknown>)) {
    if (tier === "priority" || tier === "standard") overrides[path] = tier;
  }
  return overrides;
}
