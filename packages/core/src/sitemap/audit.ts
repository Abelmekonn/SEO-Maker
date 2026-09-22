/**
 * Sitemap analysis (PRD §12).
 *
 * The crawl visits a sample of the sitemap's URLs anyway, so the findings here
 * come from real crawl evidence rather than a second pass of requests: a
 * sitemap URL that 301s, 404s or carries `noindex` is only known once we have
 * fetched it.
 */

export type SitemapDocument = {
  url: string;
  kind: "index" | "urlset" | "unknown";
  status: number | null;
  /** Reachable and parseable. */
  ok: boolean;
  entryCount: number;
  malformedCount: number;
  error: string | null;
};

/** What the crawl learned about one sitemap-listed URL it actually fetched. */
export type SitemapUrlEvidence = {
  url: string;
  statusCode: number | null;
  finalUrl: string | null;
  indexable: boolean | null;
};

export type SitemapAudit = {
  /** Every sitemap document read, including nested ones from an index. */
  documents: SitemapDocument[];
  found: boolean;
  valid: boolean;
  /** Distinct, same-site, normalized URLs across all documents. */
  urlCount: number;
  /** Listed URLs pointing at another host. */
  offSiteCount: number;
  /** Listed URLs that normalized to a URL already listed. */
  duplicateCount: number;
  /** Listed URLs robots.txt forbids. */
  disallowedCount: number;
  /** How many listed URLs the crawl actually fetched. */
  sampledCount: number;
  /** Of the sampled URLs: responded 4xx/5xx. */
  brokenUrls: string[];
  /** Of the sampled URLs: redirected somewhere else. */
  redirectingUrls: Array<{ url: string; to: string }>;
  /** Of the sampled URLs: carried noindex despite being advertised. */
  noindexUrls: string[];
  issueCount: number;
};

export type BuildSitemapAuditInput = {
  documents: SitemapDocument[];
  urlCount: number;
  offSiteCount: number;
  duplicateCount: number;
  disallowedCount: number;
  evidence: SitemapUrlEvidence[];
};

export function buildSitemapAudit(input: BuildSitemapAuditInput): SitemapAudit {
  const brokenUrls: string[] = [];
  const redirectingUrls: Array<{ url: string; to: string }> = [];
  const noindexUrls: string[] = [];

  for (const item of input.evidence) {
    if (item.statusCode != null && item.statusCode >= 400) {
      brokenUrls.push(item.url);
      continue;
    }
    if (item.finalUrl && item.finalUrl !== item.url) {
      redirectingUrls.push({ url: item.url, to: item.finalUrl });
    }
    if (item.indexable === false) {
      noindexUrls.push(item.url);
    }
  }

  const found = input.documents.some((doc) => doc.ok);
  const valid =
    found &&
    input.documents.every((doc) => !doc.ok || (doc.kind !== "unknown" && doc.malformedCount === 0));

  return {
    documents: input.documents,
    found,
    valid,
    urlCount: input.urlCount,
    offSiteCount: input.offSiteCount,
    duplicateCount: input.duplicateCount,
    disallowedCount: input.disallowedCount,
    sampledCount: input.evidence.length,
    brokenUrls: brokenUrls.slice(0, 50),
    redirectingUrls: redirectingUrls.slice(0, 50),
    noindexUrls: noindexUrls.slice(0, 50),
    issueCount:
      brokenUrls.length +
      redirectingUrls.length +
      noindexUrls.length +
      input.offSiteCount +
      input.disallowedCount +
      input.documents.reduce((sum, doc) => sum + doc.malformedCount, 0),
  };
}
