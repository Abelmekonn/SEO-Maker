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

export function pagePath(url: string) {
  try {
    const path = new URL(url).pathname;
    return path === "" ? "/" : path;
  } catch {
    return url;
  }
}
