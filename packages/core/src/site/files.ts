/**
 * sitemap.xml and robots.txt, generated from crawl evidence (Phase 3.4).
 *
 * Deterministic on purpose. A URL in a generated sitemap is a page the crawl
 * fetched, found indexable and found canonical to itself; nothing is invented,
 * and nothing is written by a model. Both outputs are checked with the same
 * parsers the crawler reads real sites with before they are offered.
 *
 * robots.txt is handled with care about what we did not see. The crawl keeps
 * the audit of a site's robots.txt, not its text, so when a file exists this
 * suggests lines to add and problems to fix rather than a replacement that
 * would silently drop the site's own rules.
 */

import { hostKey, pageKeyOf } from "../crawl/url";
import { parseRobotsTxt } from "../robots/parse";
import type { RobotsAudit } from "../robots/audit";
import type { SitemapAudit } from "../sitemap/audit";
import { parseSitemapXml } from "../sitemap/parse";

export type SitemapSourcePage = {
  url: string;
  finalUrl: string | null;
  status: string;
  statusCode: number | null;
  indexable: boolean | null;
  canonicalUrl: string | null;
  robotsDisallowed: boolean | null;
  inSitemap?: boolean | null;
};

export type Exclusion = { url: string; reason: string };

/** Why a crawled page does not belong in a sitemap, or null when it does. */
export function sitemapExclusion(page: SitemapSourcePage, siteHost: string): string | null {
  const address = page.finalUrl ?? page.url;
  if (page.status !== "analyzed") return "Not fetched successfully";
  if (page.statusCode == null || page.statusCode < 200 || page.statusCode >= 300) {
    return `Answered HTTP ${page.statusCode ?? "without a status"}`;
  }
  try {
    if (hostKey(new URL(address).hostname) !== siteHost) return "On another host";
  } catch {
    return "Not a valid URL";
  }
  if (page.indexable === false) return "Sends noindex";
  if (page.robotsDisallowed === true) return "Disallowed by robots.txt";
  if (page.canonicalUrl && pageKeyOf(page.canonicalUrl) !== pageKeyOf(address)) {
    return `Canonical points to ${page.canonicalUrl}`;
  }
  return null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type GeneratedSitemap = {
  xml: string;
  urls: string[];
  excluded: Exclusion[];
  validation: { ok: boolean; errors: string[] };
};

/** The spec's per-file ceiling. A crawl never gets near it, but the file must never exceed it. */
const SITEMAP_URL_LIMIT = 50_000;

export function generateSitemap(pages: SitemapSourcePage[], rootUrl: string): GeneratedSitemap {
  let siteHost = "";
  try {
    siteHost = hostKey(new URL(rootUrl).hostname);
  } catch {
    // Every page is then excluded as "on another host", which is the safe outcome.
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  const excluded: Exclusion[] = [];
  for (const page of pages) {
    const address = page.finalUrl ?? page.url;
    const reason = sitemapExclusion(page, siteHost);
    if (reason) {
      excluded.push({ url: address, reason });
      continue;
    }
    const key = pageKeyOf(address);
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(address);
  }

  // Homepage first, then alphabetical, so the file diffs cleanly between crawls.
  const rootKey = pageKeyOf(rootUrl);
  urls.sort((a, b) => {
    const aRoot = pageKeyOf(a) === rootKey;
    const bRoot = pageKeyOf(b) === rootKey;
    return aRoot === bRoot ? a.localeCompare(b) : aRoot ? -1 : 1;
  });
  const listed = urls.slice(0, SITEMAP_URL_LIMIT);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...listed.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");

  return { xml, urls: listed, excluded, validation: validateSitemap(xml, listed) };
}

/** Re-reads a generated sitemap with the crawler's own parser. */
export function validateSitemap(xml: string, expected: string[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const parsed = parseSitemapXml(xml);
  if (!parsed.wellFormed || parsed.kind !== "urlset") errors.push("Not a <urlset> document.");
  if (parsed.malformed.length > 0) errors.push(`${parsed.malformed.length} <loc> values are not valid URLs.`);
  if (parsed.entries.length !== expected.length) {
    errors.push(`Expected ${expected.length} entries, read back ${parsed.entries.length}.`);
  }
  const want = new Set(expected);
  const stray = parsed.entries.filter((entry) => !want.has(entry.loc));
  if (stray.length > 0) errors.push(`${stray.length} entries do not match a crawled URL.`);
  if (expected.length === 0) errors.push("No crawled page is eligible for the sitemap.");
  return { ok: errors.length === 0, errors };
}

export type SitemapRecommendation = {
  status: "ok" | "missing" | "needs-changes";
  generated: GeneratedSitemap;
  /** Entries in the site's current sitemap to remove or replace, from crawl evidence. */
  remove: Array<{ url: string; reason: string; replaceWith?: string }>;
  /** Eligible crawled pages the current sitemap does not list. */
  add: string[];
  /** Always shown: a generated sitemap only knows the pages the crawl reached. */
  coverageNote: string;
};

export function recommendSitemap(input: {
  rootUrl: string;
  pages: SitemapSourcePage[];
  audit: SitemapAudit | null;
  discovered?: number | null;
}): SitemapRecommendation {
  const generated = generateSitemap(input.pages, input.rootUrl);
  const audit = input.audit;
  const remove: SitemapRecommendation["remove"] = [];
  if (audit?.found) {
    for (const url of audit.brokenUrls ?? []) remove.push({ url, reason: "Answers with an error" });
    for (const row of audit.redirectingUrls ?? []) {
      remove.push({ url: row.url, reason: "Redirects", replaceWith: row.to });
    }
    for (const url of audit.noindexUrls ?? []) remove.push({ url, reason: "Sends noindex" });
  }
  const eligible = new Set(generated.urls.map((url) => pageKeyOf(url)));
  const add = audit?.found
    ? input.pages
        .filter((page) => page.inSitemap === false && eligible.has(pageKeyOf(page.finalUrl ?? page.url)))
        .map((page) => page.finalUrl ?? page.url)
    : [];

  const crawled = generated.urls.length;
  const discovered = input.discovered ?? null;
  const coverageNote =
    discovered && discovered > crawled
      ? `Lists the ${crawled} eligible pages this crawl fetched. The site has at least ${discovered} known URLs, so extend it from your CMS or crawl more pages before replacing an existing sitemap.`
      : `Lists the ${crawled} eligible pages this crawl fetched.`;

  return {
    status: !audit?.found ? "missing" : remove.length > 0 || add.length > 0 ? "needs-changes" : "ok",
    generated,
    remove,
    add,
    coverageNote,
  };
}

export type RobotsFinding = { severity: "critical" | "high" | "medium" | "low"; message: string };

export type RobotsRecommendation = {
  status: "ok" | "missing" | "needs-changes";
  /** A complete file, only when the site has none. */
  file: string | null;
  /** Lines to add to the existing file. */
  additions: string[];
  findings: RobotsFinding[];
  validation: { ok: boolean; errors: string[] };
};

/**
 * @param sitemapUrl A sitemap the crawl actually found, or the address the
 *   generated sitemap will be published at. The caller says which.
 */
export function recommendRobots(input: { audit: RobotsAudit | null; sitemapUrl: string | null }): RobotsRecommendation {
  const { audit, sitemapUrl } = input;
  const findings: RobotsFinding[] = [];

  if (!audit?.found) {
    const file = ["User-agent: *", "Allow: /", ...(sitemapUrl ? ["", `Sitemap: ${sitemapUrl}`] : []), ""].join("\n");
    findings.push({
      severity: "medium",
      message: audit?.status
        ? `robots.txt answered HTTP ${audit.status}. Serve this file at /robots.txt.`
        : "No robots.txt was found. Serve this file at /robots.txt.",
    });
    return { status: "missing", file, additions: [], findings, validation: validateRobots(file, sitemapUrl ? [sitemapUrl] : []) };
  }

  const additions: string[] = [];
  if (audit.blocksEverything) {
    findings.push({
      severity: "critical",
      message: `The rules for ${audit.appliedAgent ?? "all crawlers"} disallow "/", which blocks the whole site. Remove that line unless the site should stay out of search.`,
    });
  }
  if (!audit.hasSitemapDirective && sitemapUrl) {
    additions.push(`Sitemap: ${sitemapUrl}`);
    findings.push({ severity: "medium", message: "robots.txt does not declare a sitemap. Add the Sitemap line below." });
  }
  for (const warning of audit.warnings ?? []) {
    findings.push({ severity: "low", message: `Line ${warning.line}: "${warning.text}". ${warning.message}` });
  }
  for (const url of (audit.blockedSitemapUrls ?? []).slice(0, 10)) {
    findings.push({ severity: "high", message: `Disallows ${url}, which the sitemap lists. Unblock it or drop it from the sitemap.` });
  }

  // The additions are checked inside a minimal group, since a Sitemap line is
  // read the same wherever it sits in the file.
  const declared = additions.map((line) => line.replace(/^Sitemap:\s*/, ""));
  return {
    status: findings.length === 0 ? "ok" : "needs-changes",
    file: null,
    additions,
    findings,
    validation: validateRobots(["User-agent: *", "Allow: /", ...additions].join("\n"), declared),
  };
}

/** Re-reads generated robots.txt text with the crawler's own parser. */
export function validateRobots(text: string, expectedSitemaps: string[]): { ok: boolean; errors: string[] } {
  const parsed = parseRobotsTxt(text);
  const errors: string[] = [];
  if (parsed.warnings.length > 0) errors.push(...parsed.warnings.map((warning) => `Line ${warning.line}: ${warning.message}`));
  if (parsed.groups.length === 0) errors.push("No user-agent group.");
  for (const url of expectedSitemaps) {
    if (!parsed.sitemaps.includes(url)) errors.push(`Sitemap ${url} was not read back.`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Where the site's sitemap lives, if the crawl found one. The top-level
 * document is preferred: an index when there is one, else the first urlset.
 */
export function foundSitemapUrl(audit: SitemapAudit | null): string | null {
  const documents = (audit?.documents ?? []).filter((doc) => doc.ok);
  return (documents.find((doc) => doc.kind === "index") ?? documents[0])?.url ?? null;
}
