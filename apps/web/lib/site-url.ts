export type NormalizedSiteUrl = {
  href: string;
  hostname: string;
};

export function normalizeSiteUrl(value: string): NormalizedSiteUrl | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: "Enter a site URL to start a project." };
  }

  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(href);
    if (!parsed.hostname.includes(".")) {
      return { error: "Enter a full site URL, like example.com." };
    }

    parsed.hash = "";
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");

    return {
      href: `${parsed.origin}${pathname}`,
      hostname: parsed.hostname.replace(/^www\./, ""),
    };
  } catch {
    return { error: "Enter a valid site URL, like example.com." };
  }
}

export function findHomepage<T extends { url: string; finalUrl?: string | null }>(
  pages: T[],
  rootUrl: string,
): T | null {
  if (pages.length === 0) {
    return null;
  }

  const root = tryUrl(rootUrl);
  const match = pages.find((page) => {
    const pageUrl = tryUrl(page.finalUrl ?? page.url);
    if (!root || !pageUrl) {
      return page.url === rootUrl;
    }
    return (
      pageUrl.origin === root.origin &&
      (pageUrl.pathname === "/" || pageUrl.pathname === "" || pageUrl.pathname === root.pathname)
    );
  });

  return match ?? pages[0] ?? null;
}

function tryUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function pagePath(url: string) {
  try {
    const path = new URL(url).pathname;
    return path === "" ? "/" : path;
  } catch {
    return url;
  }
}

/**
 * A site's identity for "is this already added?": lower-cased host without
 * "www.", plus any path, without query, fragment or trailing slash. Matches
 * the backfill in the project_site_key migration, so old and new rows agree.
 */
export function siteKeyOf(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}
