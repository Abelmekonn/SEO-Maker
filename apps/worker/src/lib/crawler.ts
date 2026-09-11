import { CheerioCrawler, Configuration } from "crawlee";

const SKIP_PATH = /\.(?:pdf|zip|png|jpe?g|gif|webp|svg|css|js|mjs|map|mp4|mp3|woff2?|ttf|ico|xml|json|txt)$/i;

export type PageAudit = {
  url: string;
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

export type HomepageAudit = PageAudit;

export function normalizePageUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (SKIP_PATH.test(parsed.pathname)) {
      return null;
    }
    parsed.hash = "";
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export async function crawlHomepageHtml(url: string): Promise<PageAudit> {
  const pages = await crawlSite(url, 1);
  const homepage = pages[0];
  if (!homepage) {
    throw new Error(`Could not fetch ${url}`);
  }
  return homepage;
}

export async function crawlSite(
  startUrl: string,
  maxPages: number,
  hooks?: { onPage?: (audit: PageAudit) => Promise<void> },
): Promise<PageAudit[]> {
  const start = normalizePageUrl(startUrl);
  if (!start) {
    throw new Error(`Invalid start URL: ${startUrl}`);
  }

  const limit = Math.max(1, Math.min(maxPages, 100));
  const startHost = hostKey(new URL(start).hostname);
  const robots = await fetchRobotsData(new URL(start).origin);
  const sitemapUrls = robots.sitemapUrl
    ? await fetchSitemapUrls(robots.sitemapUrl, startHost, limit)
    : [];
  const seeds = uniqueUrls([start, ...sitemapUrls]).slice(0, limit);
  const results: PageAudit[] = [];
  const seen = new Set<string>();

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: limit,
      maxConcurrency: 1,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 30,
      async requestHandler({ $, request, response, enqueueLinks }) {
        const loadedUrl = normalizePageUrl(request.loadedUrl ?? request.url) ?? request.url;
        if (seen.has(loadedUrl)) {
          return;
        }
        seen.add(loadedUrl);

        const loaded = new URL(loadedUrl);
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
        const noindex =
          robotsMeta.includes("noindex") || (xRobotsTag ? xRobotsTag.includes("noindex") : false);

        const audit: PageAudit = {
          url: loadedUrl,
          finalUrl: loadedUrl,
          isHttps: loaded.protocol === "https:",
          statusCode: response?.statusCode ?? null,
          title: title || null,
          metaDesc: metaDesc || null,
          h1: h1 || null,
          h2Count: $("h2").length,
          canonicalUrl: canonical ? toAbsoluteUrl(canonical, loadedUrl) : null,
          wordCount: text ? text.split(" ").filter(Boolean).length : 0,
          imageCount: images.length,
          missingAlt,
          internalLinks: countInternalLinks(
            $("a[href]").toArray().map((anchor) => $(anchor).attr("href")),
            loaded,
          ),
          schemaCount: $('script[type="application/ld+json"]')
            .toArray()
            .filter((script) => $(script).text().trim().length > 0).length,
          robotsTxtUrl: robots.robotsTxtUrl,
          robotsOk: robots.robotsOk,
          sitemapUrl: robots.sitemapUrl,
          hasSitemap: robots.hasSitemap,
          xRobotsTag,
          indexable: !noindex && (response?.statusCode ?? 0) < 400,
        };

        results.push(audit);
        if (hooks?.onPage) {
          await hooks.onPage(audit);
        }

        if (limit > 1) {
          await enqueueLinks({
            strategy: "same-domain",
            transformRequestFunction: (req) => {
              const next = normalizePageUrl(req.url);
              if (!next || seen.has(next) || hostKey(new URL(next).hostname) !== startHost) {
                return false;
              }
              req.url = next;
              req.uniqueKey = next;
              return req;
            },
          });
        }
      },
    },
    new Configuration({ persistStorage: false, systemInfoV2: false }),
  );

  await crawler.run(
    seeds.map((url) => ({
      url,
      uniqueKey: url,
    })),
  );

  if (results.length === 0) {
    throw new Error(`Could not fetch ${start}`);
  }

  return results;
}

function hostKey(hostname: string) {
  return hostname.replace(/^www\./, "").toLowerCase();
}

function uniqueUrls(urls: string[]) {
  return [...new Set(urls.filter(Boolean))];
}

function toAbsoluteUrl(rawHref: string, base: string): string | null {
  return normalizePageUrl(new URL(rawHref, base).toString());
}

function countInternalLinks(hrefs: Array<string | undefined>, base: URL): number {
  const originHost = hostKey(base.hostname);
  return hrefs.reduce((count, href) => {
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return count;
    }
    const target = normalizePageUrl(new URL(href, base).toString());
    if (!target) {
      return count;
    }
    return hostKey(new URL(target).hostname) === originHost ? count + 1 : count;
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
      return { robotsTxtUrl, robotsOk: false, sitemapUrl: null as string | null, hasSitemap: false };
    }

    const text = await response.text();
    const sitemapMatch = text.match(/^\s*Sitemap:\s*(\S+)\s*$/im);
    const sitemapUrl = sitemapMatch?.[1]?.trim() ?? `${origin}/sitemap.xml`;
    return {
      robotsTxtUrl,
      robotsOk: true,
      sitemapUrl,
      hasSitemap: Boolean(sitemapMatch?.[1]),
    };
  } catch {
    return { robotsTxtUrl, robotsOk: false, sitemapUrl: null as string | null, hasSitemap: false };
  }
}

async function fetchSitemapUrls(sitemapUrl: string, siteHost: string, limit: number) {
  const urls = await readSitemapLocs(sitemapUrl, 0);
  return urls
    .map((url) => normalizePageUrl(url))
    .filter((url): url is string => {
      if (!url) {
        return false;
      }
      return hostKey(new URL(url).hostname) === siteHost;
    })
    .slice(0, limit);
}

async function readSitemapLocs(url: string, depth: number): Promise<string[]> {
  if (depth > 2) {
    return [];
  }

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "SEO-Maker-Bot/0.1" },
      redirect: "follow",
    });
    if (!response.ok) {
      return [];
    }
    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) =>
      match[1].trim().replace(/&amp;/g, "&"),
    );

    if (xml.includes("<sitemapindex") && depth < 2) {
      const nested: string[] = [];
      for (const child of locs.slice(0, 5)) {
        nested.push(...(await readSitemapLocs(child, depth + 1)));
        if (nested.length >= 200) {
          break;
        }
      }
      return nested;
    }

    return locs;
  } catch {
    return [];
  }
}
