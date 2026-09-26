/** Normalizes a hostname for comparison: lowercase, no trailing dot, no leading www. */
export function hostKey(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

export type ParsedDomain = { domain: string; url: string };

/**
 * Turns whatever the user typed into a canonical domain + https origin.
 * Returns a user-facing error string rather than throwing, matching the
 * `normalizeSiteUrl` convention already used for project URLs.
 */
export function parseDomainInput(value: string): ParsedDomain | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: "Enter a competitor domain." };
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: "That does not look like a valid domain." };
  }

  if (url.username || url.password) {
    return { error: "Remove the username and password from the URL." };
  }

  const domain = hostKey(url.hostname);
  if (!domain.includes(".")) {
    return { error: "Enter a full domain, for example example.com." };
  }
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.startsWith("-") || domain.includes("..")) {
    return { error: "That does not look like a valid domain." };
  }

  return { domain, url: `https://${domain}/` };
}

/**
 * The competitor identity of any address: "https://www.Adyen.com/en/" and
 * "adyen.com" are one competitor. Null when it is not a usable domain.
 */
export function normalizeCompetitorDomain(value: string): string | null {
  const parsed = parseDomainInput(value);
  return "error" in parsed ? null : parsed.domain;
}

/**
 * Second-level labels under a country code that are part of the suffix
 * ("co.uk", "com.au", "com.et"), not an owner's name.
 */
const COUNTRY_SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "gob", "or", "ne", "go", "ltd", "plc", "biz", "info"]);

/**
 * Hosting platforms whose subdomains belong to different owners: two
 * "*.github.io" sites are not one competitor.
 */
const PLATFORM_SUFFIXES = new Set([
  "github.io",
  "gitlab.io",
  "blogspot.com",
  "wordpress.com",
  "netlify.app",
  "vercel.app",
  "herokuapp.com",
  "pages.dev",
  "web.app",
  "firebaseapp.com",
  "azurewebsites.net",
  "cloudfront.net",
  "myshopify.com",
  "wixsite.com",
  "squarespace.com",
  "webflow.io",
  "substack.com",
  "tumblr.com",
  "weebly.com",
  "notion.site",
]);

/**
 * The domain someone registered: "docs.adyen.com" -> "adyen.com",
 * "shop.example.co.uk" -> "example.co.uk". Search results are grouped by it,
 * so a company's subdomains count as that company. A small suffix list
 * rather than the full Public Suffix List: it covers country second levels
 * and the hosting platforms that show up in search results.
 */
export function registrableDomain(host: string): string {
  const key = hostKey(host);
  if (/^\d+(\.\d+){3}$/.test(key) || key.includes(":")) return key;
  const labels = key.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");

  const lastTwo = labels.slice(-2).join(".");
  const multiLabelSuffix =
    PLATFORM_SUFFIXES.has(lastTwo) ||
    (labels[labels.length - 1].length === 2 && COUNTRY_SECOND_LEVEL.has(labels[labels.length - 2]));
  return labels.slice(multiLabelSuffix ? -3 : -2).join(".");
}

/** True when a candidate domain is the project's own site. */
export function isSelfDomain(candidate: string, rootUrl: string) {
  try {
    const self = new URL(rootUrl).hostname;
    return hostKey(self) === hostKey(candidate) || registrableDomain(self) === registrableDomain(candidate);
  } catch {
    return false;
  }
}

/**
 * Why a domain is not a business competitor, one category per domain.
 *
 * The one place this list lives. `platform` kinds are never competitors,
 * so a user cannot add one by hand either; the rest are skipped only by
 * automatic discovery, because for some businesses they are real rivals
 * (a publisher competing with a publisher) and the user can still add them.
 */
export type NonCompetitorKind =
  | "search-engine"
  | "social"
  | "video"
  | "reference"
  | "forum"
  | "app-store"
  | "platform"
  | "government"
  | "directory"
  | "review-site"
  | "marketplace"
  | "publisher";

const PLATFORM_KINDS: ReadonlySet<NonCompetitorKind> = new Set([
  "search-engine",
  "social",
  "video",
  "reference",
  "forum",
  "app-store",
  "platform",
  "government",
]);

const NON_COMPETITOR_DOMAINS: Record<string, NonCompetitorKind> = {
  // Search engines and their furniture.
  "google.com": "search-engine",
  "googleusercontent.com": "search-engine",
  "bing.com": "search-engine",
  "yahoo.com": "search-engine",
  "duckduckgo.com": "search-engine",
  "baidu.com": "search-engine",
  "yandex.com": "search-engine",
  "yandex.ru": "search-engine",
  "ask.com": "search-engine",
  // Social networks.
  "facebook.com": "social",
  "instagram.com": "social",
  "twitter.com": "social",
  "x.com": "social",
  "linkedin.com": "social",
  "pinterest.com": "social",
  "tiktok.com": "social",
  "threads.net": "social",
  "snapchat.com": "social",
  // Video.
  "youtube.com": "video",
  "youtu.be": "video",
  "vimeo.com": "video",
  // Reference.
  "wikipedia.org": "reference",
  "wikihow.com": "reference",
  "britannica.com": "reference",
  "dictionary.com": "reference",
  "merriam-webster.com": "reference",
  // Forums and Q&A.
  "reddit.com": "forum",
  "quora.com": "forum",
  "stackexchange.com": "forum",
  "stackoverflow.com": "forum",
  // App stores and the platforms that run them.
  "apple.com": "app-store",
  "play.google.com": "app-store",
  "apps.apple.com": "app-store",
  "amazon.com": "platform",
  "medium.com": "platform",
  // Directories and listings.
  "yelp.com": "directory",
  "yellowpages.com": "directory",
  "crunchbase.com": "directory",
  "bbb.org": "directory",
  "clutch.co": "directory",
  "glassdoor.com": "directory",
  "indeed.com": "directory",
  "zoominfo.com": "directory",
  "angi.com": "directory",
  "thumbtack.com": "directory",
  "producthunt.com": "directory",
  // Review and comparison sites.
  "trustpilot.com": "review-site",
  "g2.com": "review-site",
  "capterra.com": "review-site",
  "getapp.com": "review-site",
  "softwareadvice.com": "review-site",
  "tripadvisor.com": "review-site",
  "trustradius.com": "review-site",
  "nerdwallet.com": "review-site",
  "sitejabber.com": "review-site",
  // Marketplaces.
  "ebay.com": "marketplace",
  "etsy.com": "marketplace",
  "alibaba.com": "marketplace",
  "aliexpress.com": "marketplace",
  "walmart.com": "marketplace",
  "fiverr.com": "marketplace",
  "upwork.com": "marketplace",
  // Publishers that cover every industry.
  "forbes.com": "publisher",
  "investopedia.com": "publisher",
  "businessinsider.com": "publisher",
  "techcrunch.com": "publisher",
  "nytimes.com": "publisher",
  "bbc.com": "publisher",
  "bbc.co.uk": "publisher",
  "cnn.com": "publisher",
  "theguardian.com": "publisher",
  "reuters.com": "publisher",
  "bloomberg.com": "publisher",
  "hbr.org": "publisher",
  "entrepreneur.com": "publisher",
  "inc.com": "publisher",
  "zapier.com": "publisher",
  "hubspot.com": "publisher",
};

export const NON_COMPETITOR_LABELS: Record<NonCompetitorKind, string> = {
  "search-engine": "Search engine",
  social: "Social network",
  video: "Video platform",
  reference: "Reference site",
  forum: "Forum or Q&A site",
  "app-store": "App store",
  platform: "Platform, not a business competitor",
  government: "Government or academic site",
  directory: "Directory or listing site",
  "review-site": "Review or comparison site",
  marketplace: "Marketplace",
  publisher: "General publisher",
};

/** The category that keeps a domain out of competitor results, or null. */
export function nonCompetitorKind(domain: string): NonCompetitorKind | null {
  const key = hostKey(domain);
  if (/^google\.[a-z.]+$/.test(key) || /^bing\.[a-z.]+$/.test(key)) return "search-engine";
  if (/^amazon\.[a-z.]+$/.test(key) || /^ebay\.[a-z.]+$/.test(key)) return key.startsWith("amazon") ? "platform" : "marketplace";
  // Government and academic domains are informational, never commercial rivals.
  if (/\.(gov|mil|edu)(\.[a-z]{2})?$/.test(key) || /\.(gov|ac|edu)\.[a-z]{2}$/.test(key)) return "government";
  for (const [listed, kind] of Object.entries(NON_COMPETITOR_DOMAINS)) {
    if (key === listed || key.endsWith(`.${listed}`)) return kind;
  }
  return null;
}

/**
 * Domains that are never competitors, only SERP furniture: the check a
 * domain the user types must pass.
 */
export function isNonCompetitorDomain(domain: string) {
  const kind = nonCompetitorKind(domain);
  return kind != null && PLATFORM_KINDS.has(kind);
}

/** Why automatic discovery skips a domain: any listed category. */
export function discoveryExclusion(domain: string): string | null {
  const kind = nonCompetitorKind(domain);
  return kind ? NON_COMPETITOR_LABELS[kind] : null;
}
