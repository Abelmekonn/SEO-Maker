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

/** True when a candidate domain is the project's own site. */
export function isSelfDomain(candidate: string, rootUrl: string) {
  try {
    return hostKey(new URL(rootUrl).hostname) === hostKey(candidate);
  } catch {
    return false;
  }
}

/** Domains that are never competitors, only SERP furniture. */
const NON_COMPETITOR_DOMAINS = new Set([
  "google.com",
  "google.co.uk",
  "webcache.googleusercontent.com",
  "translate.google.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "pinterest.com",
  "tiktok.com",
  "reddit.com",
  "wikipedia.org",
  "amazon.com",
  "apple.com",
  "play.google.com",
  "apps.apple.com",
]);

export function isNonCompetitorDomain(domain: string) {
  const key = hostKey(domain);
  if (NON_COMPETITOR_DOMAINS.has(key)) return true;
  // Government and academic domains are informational, never commercial rivals.
  return /\.(gov|mil|edu)(\.[a-z]{2})?$/.test(key);
}
