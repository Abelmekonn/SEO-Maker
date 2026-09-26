/**
 * Which competitor pages to crawl.
 *
 * A competitor is analyzed to learn why it is visible, not to mirror its
 * site, so only a handful of pages are fetched, in this order:
 *
 *   1. its homepage
 *   2. its pages that ranked in your checked searches (the strongest evidence)
 *   3. service, product, pricing, category and landing pages linked from its
 *      homepage or listed in its sitemap, ranked by how well their address
 *      and link text match your searches and business
 *   4. at most two articles or guides
 *
 * Utility, legal, contact and paginated pages, files and other hosts are
 * never selected. Pure: the crawler supplies the candidate URLs.
 */

import { normalizePageUrl } from "../crawl/url";
import { classifyPage } from "../page/classify";
import { termSet } from "../site/terms";
import { hostKey } from "./domain";

export type PageSelectionSource = "homepage" | "serp" | "link" | "sitemap";

export type SelectedPage = {
  url: string;
  source: PageSelectionSource;
  /** Why it was chosen, shown to the user. */
  reason: string;
  pageType: string | null;
  score: number;
  query?: string;
  position?: number;
};

const SKIPPED_TYPES = new Set(["utility", "legal", "contact"]);
const TYPE_VALUE: Record<string, number> = {
  service: 1,
  product: 1,
  pricing: 0.9,
  category: 0.8,
  landing: 0.8,
  article: 0.45,
  documentation: 0.4,
  about: 0.3,
  other: 0.3,
};
const CONTENT_TYPES = new Set(["article", "documentation"]);
const MAX_CONTENT_PAGES = 2;
const FILE_EXTENSION = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp4|mp3|xml|json|txt|css|js)$/i;
const PAGINATION = /\/(page|p)\/\d+\/?$|[?&](page|p)=\d+/i;
/** Archive and feed pages. Login, cart and the like are the classifier's "utility". */
const ARCHIVE = /\/(tag|tags|author|authors|feed|wp-json)(\/|$)/i;
const LOCALE_SEGMENT = /^\/[a-z]{2}(?:[-_][a-z]{2})?(?:\/|$)/i;

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

/** One page whatever its www prefix: www.adyen.com/x and adyen.com/x are the same page. */
function pageIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    return `${hostKey(parsed.hostname)}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function words(url: string, anchor?: string | null): Set<string> {
  return termSet(pathOf(url).replace(/[/_.-]+/g, " "), anchor ?? null);
}

/**
 * Picks at most `limit` pages. `terms` are the words of your searches and
 * business, which decide which of its pages matter to you.
 */
export function selectCompetitorPages(input: {
  homepageUrl: string;
  serp: Array<{ url: string; query: string; position: number }>;
  links: Array<{ url: string; anchor?: string | null }>;
  sitemap: string[];
  terms: ReadonlySet<string>;
  limit: number;
}): SelectedPage[] {
  const limit = Math.max(1, input.limit);
  const home = normalizePageUrl(input.homepageUrl) ?? input.homepageUrl;
  let host: string;
  try {
    host = hostKey(new URL(home).hostname);
  } catch {
    return [];
  }
  const homeLocale = LOCALE_SEGMENT.exec(pathOf(home))?.[0] ?? null;

  const selected: SelectedPage[] = [{ url: home, source: "homepage", reason: "Homepage", pageType: "homepage", score: 1 }];
  const taken = new Set([pageIdentity(home)]);

  const usable = (raw: string): string | null => {
    const url = normalizePageUrl(raw);
    if (!url || taken.has(pageIdentity(url))) return null;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol) || hostKey(parsed.hostname) !== host) return null;
      if (FILE_EXTENSION.test(parsed.pathname) || PAGINATION.test(`${parsed.pathname}${parsed.search}`) || ARCHIVE.test(parsed.pathname)) return null;
    } catch {
      return null;
    }
    return url;
  };

  // Its pages that ranked in your searches, best position first.
  const serp = [...input.serp].sort((a, b) => a.position - b.position || a.query.localeCompare(b.query));
  for (const row of serp) {
    if (selected.length >= limit) break;
    const url = usable(row.url);
    if (!url) continue;
    taken.add(pageIdentity(url));
    selected.push({
      url,
      source: "serp",
      reason: `Ranks #${row.position} for "${row.query}"`,
      pageType: classifyPage({ url }).type,
      score: 1,
      query: row.query,
      position: row.position,
    });
  }

  // Then its important pages, from homepage links and the sitemap.
  const candidates = new Map<string, { url: string; anchor: string | null; source: PageSelectionSource }>();
  for (const link of input.links) {
    const url = usable(link.url);
    if (url && !candidates.has(pageIdentity(url))) candidates.set(pageIdentity(url), { url, anchor: link.anchor?.trim() || null, source: "link" });
  }
  for (const raw of input.sitemap) {
    const url = usable(raw);
    if (url && !candidates.has(pageIdentity(url))) candidates.set(pageIdentity(url), { url, anchor: null, source: "sitemap" });
  }

  const scored = [...candidates.values()].flatMap((candidate) => {
    const path = pathOf(candidate.url);
    const type = classifyPage({ url: candidate.url, title: candidate.anchor }).type;
    if (SKIPPED_TYPES.has(type) || type === "homepage") return [];
    const own = words(candidate.url, candidate.anchor);
    const matched = [...own].filter((word) => input.terms.has(word));
    const relevance = own.size ? matched.length / own.size : 0;
    const depth = path.split("/").filter(Boolean).length;
    let score = (TYPE_VALUE[type] ?? 0.3) + 0.8 * relevance + (depth <= 1 ? 0.2 : depth === 2 ? 0.1 : 0);
    if (candidate.source === "link") score += 0.1;
    // Another language's copy of a page says nothing new about the business.
    const locale = LOCALE_SEGMENT.exec(path)?.[0] ?? null;
    if (locale && locale !== homeLocale) score -= 0.6;
    return [{ ...candidate, type, matched, score: Math.round(score * 100) / 100 }];
  });
  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  let content = selected.filter((page) => page.pageType && CONTENT_TYPES.has(page.pageType)).length;
  for (const candidate of scored) {
    if (selected.length >= limit) break;
    if (CONTENT_TYPES.has(candidate.type)) {
      if (content >= MAX_CONTENT_PAGES) continue;
      content += 1;
    }
    taken.add(pageIdentity(candidate.url));
    const label = candidate.type === "other" ? "Important page" : `${candidate.type[0].toUpperCase()}${candidate.type.slice(1)} page`;
    selected.push({
      url: candidate.url,
      source: candidate.source,
      reason:
        candidate.matched.length > 0
          ? `${label} about ${candidate.matched.slice(0, 3).join(", ")}`
          : `${label} ${candidate.source === "link" ? "linked from its homepage" : "in its sitemap"}`,
      pageType: candidate.type,
      score: candidate.score,
    });
  }

  return selected;
}
