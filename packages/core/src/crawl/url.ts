/**
 * URL normalization shared by the first-party crawler, the competitor crawler
 * and the seed planner.
 *
 * Normalization exists so that two requests that reach the same document are
 * recognised as the same page before we spend a request on the second one.
 */

/** Assets and feeds we never want to treat as an HTML page. */
const SKIP_PATH =
  /\.(?:pdf|zip|gz|tar|rar|png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|cjs|map|mp4|webm|mp3|wav|woff2?|ttf|otf|eot|xml|json|txt|csv|rss|atom)$/i;

/**
 * Query parameters that never change which document is returned. Dropping them
 * collapses campaign-tagged duplicates of the same page onto one row.
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "_ga",
  "_gl",
  "igshid",
  "si",
]);

/** `www.` is not a different site. Used for same-site comparisons. */
export function hostKey(hostname: string): string {
  return hostname.replace(/^www\./, "").toLowerCase();
}

/**
 * Returns a canonical form of `value`, or null when it is not a crawlable HTML
 * page URL.
 *
 * Normalizes: scheme check, fragment removal, trailing slash, tracking
 * parameters, query parameter order, and default ports.
 */
export function normalizePageUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (SKIP_PATH.test(parsed.pathname)) {
    return null;
  }

  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";

  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();

  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  const search = parsed.searchParams.toString();
  return `${parsed.origin}${pathname}${search ? `?${search}` : ""}`;
}

/**
 * `normalizePageUrl` with the reason a URL is not a page.
 *
 * The crawl inventory reports assets and unusable URLs separately rather than
 * letting them vanish, so a sitemap full of PDFs reads as that, not as nothing.
 */
export function classifyUrl(value: string): { url: string; reason: null } | { url: null; reason: "invalid" | "asset" } {
  const url = normalizePageUrl(value);
  if (url) {
    return { url, reason: null };
  }
  try {
    const parsed = new URL(value);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && SKIP_PATH.test(parsed.pathname)) {
      return { url: null, reason: "asset" };
    }
  } catch {
    // Falls through: not a URL at all.
  }
  return { url: null, reason: "invalid" };
}

/**
 * A page's identity across crawls: host without "www.", then path and query,
 * from the normalized URL ("stripe.com", "stripe.com/pricing").
 *
 * Every crawl writes its own Page rows, so a result tied to a row id vanished
 * from view at the next crawl. PageSpeed and AI results are looked up by this
 * key instead. The scheme is dropped so an http to https move keeps them too.
 *
 * The migration that backfilled existing rows computes the same key in SQL:
 * keep the two in step.
 */
export function pageKeyOf(url: string): string {
  const normalized = normalizePageUrl(url) ?? url;
  return normalized.replace(/^https?:\/\/(?:www\.)?/i, "").replace(/\/+(?=$|\?)/, "");
}

/**
 * Every URL identity a crawled page answers to: the address that answered,
 * and the one it was requested at when it redirected. The site's page
 * inventory lists the requested address, so a page that redirects is matched
 * to its inventory entry through the redirect it recorded.
 */
export function pageKeysOf(page: { url: string; finalUrl?: string | null; evidence?: unknown }): string[] {
  const keys = new Set([pageKeyOf(page.url)]);
  if (page.finalUrl) keys.add(pageKeyOf(page.finalUrl));
  const chain = (page.evidence as { redirectChain?: Array<{ from?: unknown }> } | null | undefined)?.redirectChain;
  const from = Array.isArray(chain) ? chain[0]?.from : undefined;
  if (typeof from === "string" && from) keys.add(pageKeyOf(from));
  return [...keys];
}

/** Resolves `href` against `base` and normalizes it. Null when unusable. */
export function toAbsoluteUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    /^(?:mailto|tel|javascript|data|sms|ftp):/i.test(trimmed)
  ) {
    return null;
  }
  try {
    return normalizePageUrl(new URL(trimmed, base).toString());
  } catch {
    return null;
  }
}

/** Number of path segments. The homepage is depth 0. */
export function pathDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 99;
  }
}

/**
 * First path segment, used to group a site into sections.
 * The homepage belongs to the synthetic `/` section.
 */
export function sectionOf(url: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0];
    return segment ? segment.toLowerCase() : "/";
  } catch {
    return "/";
  }
}

export function isSameSite(url: string, siteHost: string): boolean {
  try {
    return hostKey(new URL(url).hostname) === siteHost;
  } catch {
    return false;
  }
}
