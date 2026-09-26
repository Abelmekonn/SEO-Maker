/** Fixtures shared by the site tests. Not exported from the package. */

import type { LinkEvidence, PageEvidence } from "../page/intelligence";
import type { SitePageInput } from "./intelligence";

export function link(href: string, anchor = "Link"): LinkEvidence {
  return { href, anchor, internal: true, rel: [], empty: !anchor };
}

export function sitePage(overrides: Partial<SitePageInput> & { links?: LinkEvidence[]; h2?: string[]; schema?: string[] } = {}): SitePageInput {
  const { links = [], h2 = [], schema = [], ...rest } = overrides;
  const evidence: PageEvidence = {
    headings: h2.map((text) => ({ level: 2, text })),
    links,
    images: [],
    schema: schema.map((type) => ({ types: [type], data: {}, valid: true, error: null })),
    openGraph: {},
    twitter: {},
    redirectChain: [],
  };
  return {
    id: rest.url ?? "p",
    url: "https://x.com/",
    finalUrl: null,
    status: "analyzed",
    statusCode: 200,
    pageType: null,
    searchIntent: null,
    title: null,
    metaDesc: null,
    h1: null,
    wordCount: 500,
    internalLinks: links.length,
    canonicalUrl: null,
    indexable: true,
    inSitemap: null,
    robotsDisallowed: null,
    depth: 1,
    discoveredVia: "link",
    contentHash: null,
    evidence,
    issues: [],
    ...rest,
  };
}
