import { normalizePageUrl, pathDepth, sectionOf } from "./url";

/**
 * Seed planning: decide which URLs a bounded crawl should spend its budget on.
 *
 * Why this exists: a sitemap is written in whatever order the site generates
 * it, and taking the first N entries means one section can swallow the whole
 * crawl. Crawling stripe.com this way produced 72 pages of /legal and never
 * reached a single product page, which makes the audit useless for the
 * business. Seeds are therefore spread across sections instead of sliced.
 */

export type SeedPlan = {
  /** URLs to enqueue, in crawl order. */
  seeds: string[];
  /** Distinct sections represented in `seeds`. */
  sections: string[];
  /** Sitemap URLs that were valid but did not fit the budget. */
  deferred: number;
  /** Sitemap URLs dropped because they were duplicates after normalization. */
  duplicates: number;
  /** Sitemap URLs dropped because robots.txt disallows them. */
  disallowed: number;
  /** Sitemap URLs dropped because they belong to another host. */
  offSite: number;
};

export type PlanSeedsInput = {
  /** Normalized homepage / start URL. Always seeded first. */
  start: string;
  /** Raw URLs read from sitemap.xml, in document order. */
  sitemapUrls: string[];
  /** Page budget for the crawl. */
  limit: number;
  /** Host the crawl is allowed to touch, already `hostKey`-normalized. */
  siteHost: string;
  /** Returns true when robots.txt forbids the path for our user agent. */
  isDisallowed?: (pathname: string) => boolean;
  /**
   * Largest share of the budget a single section may take, 0-1.
   * Relaxed automatically when there is nothing else to spend the budget on.
   */
  maxSectionShare?: number;
};

const DEFAULT_SECTION_SHARE = 0.35;

/**
 * Builds a crawl-order seed list that is spread across the site.
 *
 * Order within a section is shallowest-first, so `/payments` is reached before
 * `/payments/features/disputes`. Sections are then interleaved round-robin, so
 * an early budget cut still leaves a representative sample of the site.
 */
export function planSeeds(input: PlanSeedsInput): SeedPlan {
  const { start, sitemapUrls, siteHost } = input;
  const limit = Math.max(1, input.limit);
  const share = input.maxSectionShare ?? DEFAULT_SECTION_SHARE;
  const isDisallowed = input.isDisallowed ?? (() => false);

  const seen = new Set<string>([start]);
  const bySection = new Map<string, string[]>();
  let duplicates = 0;
  let disallowed = 0;
  let offSite = 0;

  for (const raw of sitemapUrls) {
    const url = normalizePageUrl(raw);
    if (!url) {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }

    if (parsed.hostname.replace(/^www\./, "").toLowerCase() !== siteHost) {
      offSite += 1;
      continue;
    }
    if (isDisallowed(parsed.pathname)) {
      disallowed += 1;
      continue;
    }
    if (seen.has(url)) {
      duplicates += 1;
      continue;
    }

    seen.add(url);
    const section = sectionOf(url);
    const bucket = bySection.get(section);
    if (bucket) {
      bucket.push(url);
    } else {
      bySection.set(section, [url]);
    }
  }

  for (const bucket of bySection.values()) {
    bucket.sort((a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b));
  }

  // The homepage may also appear in the sitemap under its own section; it is
  // already seeded, so that section just has one fewer candidate.
  bySection.delete("/");

  const seeds = [start];
  const cap = Math.max(1, Math.ceil(limit * share));
  const taken = new Map<string, number>();
  const queues = [...bySection.entries()].sort(
    ([a, aUrls], [b, bUrls]) => bUrls.length - aUrls.length || a.localeCompare(b),
  );

  // Pass one: round-robin under the per-section cap, so no single section can
  // consume the budget while other sections still have candidates.
  let progressed = true;
  while (seeds.length < limit && progressed) {
    progressed = false;
    for (const [section, urls] of queues) {
      if (seeds.length >= limit) {
        break;
      }
      const used = taken.get(section) ?? 0;
      if (used >= cap || used >= urls.length) {
        continue;
      }
      seeds.push(urls[used]);
      taken.set(section, used + 1);
      progressed = true;
    }
  }

  // Pass two: budget left over because every section hit its cap (a site that
  // genuinely only has one section). Spend the remainder rather than waste it.
  if (seeds.length < limit) {
    for (const [section, urls] of queues) {
      for (let index = taken.get(section) ?? 0; index < urls.length; index += 1) {
        if (seeds.length >= limit) {
          break;
        }
        seeds.push(urls[index]);
        taken.set(section, index + 1);
      }
      if (seeds.length >= limit) {
        break;
      }
    }
  }

  const totalCandidates = [...bySection.values()].reduce((sum, urls) => sum + urls.length, 0);
  const used = [...taken.values()].reduce((sum, count) => sum + count, 0);

  return {
    seeds,
    sections: [...new Set(seeds.map(sectionOf))],
    deferred: totalCandidates - used,
    duplicates,
    disallowed,
    offSite,
  };
}
