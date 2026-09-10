import { CheerioCrawler, Configuration } from "crawlee";

export type HomepageAudit = {
  finalUrl: string | null;
  isHttps: boolean;
  statusCode: number | null;
  title: string | null;
  metaDesc: string | null;
  h1: string | null;
  h2Count: number;
  canonicalUrl: string | null;
  wordCount: number;
  imageCount: number;
  missingAlt: number;
  internalLinks: number;
  schemaCount: number;
  robotsTxtUrl: string | null;
  robotsOk: boolean;
  sitemapUrl: string | null;
  hasSitemap: boolean;
  xRobotsTag: string | null;
  indexable: boolean;
};

export async function crawlHomepageHtml(url: string): Promise<HomepageAudit> {
  const input = new URL(url);
  const result: HomepageAudit = {
    finalUrl: null,
    isHttps: input.protocol === "https:",
    statusCode: null,
    title: null,
    metaDesc: null,
    h1: null,
    h2Count: 0,
    canonicalUrl: null,
    wordCount: 0,
    imageCount: 0,
    missingAlt: 0,
    internalLinks: 0,
    schemaCount: 0,
    robotsTxtUrl: null,
    robotsOk: false,
    sitemapUrl: null,
    hasSitemap: false,
    xRobotsTag: null,
    indexable: true,
  };
  let handled = false;

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: 1,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 30,
      async requestHandler({ $, request, response }) {
        const loadedUrl = request.loadedUrl ?? request.url;
        const loaded = new URL(loadedUrl);
        const origin = loaded.origin;
        const title = $("title").first().text().replace(/\s+/g, " ").trim();
        const metaDesc = (
          $('meta[name="description"]').attr("content") ??
          $('meta[property="og:description"]').attr("content") ??
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
        const canonical = $('link[rel="canonical"]').attr("href")?.trim() ?? "";
        const canonicalUrl = canonical ? toAbsoluteUrl(canonical, loadedUrl) : null;
        const robotsMeta = (
          $('meta[name="robots"]').attr("content") ??
          $('meta[name="googlebot"]').attr("content") ??
          ""
        )
          .toLowerCase()
          .trim();
        const xRobotsTag = response?.headers?.["x-robots-tag"]?.toString()?.toLowerCase() ?? null;
        const text = $("body").text().replace(/\s+/g, " ").trim();
        const images = $("img").toArray();
        const missingAlt = images.filter((img) => !$(img).attr("alt")?.trim()).length;
        const internalLinks = countInternalLinks($('a[href]').toArray().map((a) => $(a).attr("href")), loaded);
        const schemaCount = $('script[type="application/ld+json"]')
          .toArray()
          .filter((script) => $(script).text().trim().length > 0).length;
        const robots = await fetchRobotsData(origin);

        const noindex =
          robotsMeta.includes("noindex") || (xRobotsTag ? xRobotsTag.includes("noindex") : false);

        result.finalUrl = loadedUrl;
        result.isHttps = loaded.protocol === "https:";
        result.statusCode = response?.statusCode ?? null;
        result.title = title || null;
        result.metaDesc = metaDesc || null;
        result.h1 = h1 || null;
        result.h2Count = $("h2").length;
        result.canonicalUrl = canonicalUrl;
        result.wordCount = text ? text.split(" ").filter(Boolean).length : 0;
        result.imageCount = images.length;
        result.missingAlt = missingAlt;
        result.internalLinks = internalLinks;
        result.schemaCount = schemaCount;
        result.robotsTxtUrl = robots.robotsTxtUrl;
        result.robotsOk = robots.robotsOk;
        result.sitemapUrl = robots.sitemapUrl;
        result.hasSitemap = robots.hasSitemap;
        result.xRobotsTag = xRobotsTag;
        result.indexable = !noindex && (response?.statusCode ?? 0) < 400;
        handled = true;
      },
    },
    // Work around a Windows crash in Crawlee systemInfoV2 process parsing.
    // v2 uses PowerShell table output that can truncate headers in some shells.
    new Configuration({ persistStorage: false, systemInfoV2: false }),
  );

  await crawler.run([{ url, uniqueKey: `${Date.now()}:${url}` }]);

  if (!handled) {
    throw new Error(`Could not fetch ${url}`);
  }

  return result;
}

function toAbsoluteUrl(rawHref: string, base: string): string | null {
  try {
    return new URL(rawHref, base).toString();
  } catch {
    return null;
  }
}

function countInternalLinks(hrefs: Array<string | undefined>, base: URL): number {
  return hrefs.reduce((count, href) => {
    if (!href) {
      return count;
    }
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return count;
    }
    try {
      const target = new URL(href, base);
      return target.origin === base.origin ? count + 1 : count;
    } catch {
      return count;
    }
  }, 0);
}

async function fetchRobotsData(origin: string) {
  const robotsTxtUrl = `${origin}/robots.txt`;
  try {
    const response = await fetch(robotsTxtUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "SEO-Maker-Bot/0.1" },
    });
    if (!response.ok) {
      return { robotsTxtUrl, robotsOk: false, sitemapUrl: null, hasSitemap: false };
    }

    const text = await response.text();
    const sitemapMatch = text.match(/^\s*Sitemap:\s*(\S+)\s*$/im);
    const sitemapUrl = sitemapMatch?.[1]?.trim() ?? null;
    return {
      robotsTxtUrl,
      robotsOk: true,
      sitemapUrl,
      hasSitemap: Boolean(sitemapUrl),
    };
  } catch {
    return { robotsTxtUrl, robotsOk: false, sitemapUrl: null, hasSitemap: false };
  }
}
