/**
 * sitemap.xml parsing.
 *
 * Deliberately regex-based rather than a full XML parser: sitemaps in the wild
 * are frequently served with broken declarations or stray entities, and a
 * strict parser turns "I can read 4,000 of these 4,001 URLs" into "invalid".
 * We still report what did not parse.
 */

export type SitemapEntry = {
  loc: string;
  lastmod: string | null;
};

export type ParsedSitemap = {
  kind: "index" | "urlset" | "unknown";
  entries: SitemapEntry[];
  /** `<loc>` values that are not usable URLs. */
  malformed: string[];
  /** Document declared a namespace we recognise. */
  wellFormed: boolean;
};

const LOC_BLOCK = /<(url|sitemap)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const LOC = /<loc>\s*([\s\S]*?)\s*<\/loc>/i;
const LASTMOD = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i;

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .trim();
}

export function parseSitemapXml(xml: string): ParsedSitemap {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const isUrlset = /<urlset[\s>]/i.test(xml);

  const entries: SitemapEntry[] = [];
  const malformed: string[] = [];

  for (const block of xml.matchAll(LOC_BLOCK)) {
    const body = block[2];
    const loc = LOC.exec(body)?.[1];
    if (!loc) {
      continue;
    }
    const decoded = decodeEntities(loc);
    try {
      const url = new URL(decoded);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        malformed.push(decoded.slice(0, 200));
        continue;
      }
    } catch {
      malformed.push(decoded.slice(0, 200));
      continue;
    }
    entries.push({ loc: decoded, lastmod: LASTMOD.exec(body)?.[1]?.trim() ?? null });
  }

  // Some generators omit the wrapping element entirely; fall back to bare <loc>.
  if (entries.length === 0 && malformed.length === 0) {
    for (const match of xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
      const decoded = decodeEntities(match[1]);
      try {
        new URL(decoded);
        entries.push({ loc: decoded, lastmod: null });
      } catch {
        malformed.push(decoded.slice(0, 200));
      }
    }
  }

  return {
    kind: isIndex ? "index" : isUrlset ? "urlset" : "unknown",
    entries,
    malformed,
    wellFormed: isIndex || isUrlset,
  };
}
