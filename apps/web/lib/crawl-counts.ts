/**
 * How many pages a site has crawled, counted the same way on every screen.
 * No database access: client components count with these too.
 */

/** errorType the crawler gives a URL that answered with a file (a PDF, a JSON file), not a page. */
const NOT_HTML = "not-html";

/** The latest crawl's rows that are pages: files a crawl met are left out. */
export function crawledPagesOf<T extends { errorType?: string | null }>(pages: T[]): T[] {
  return pages.filter((page) => page.errorType !== NOT_HTML);
}

/**
 * Pages crawled into the system, for "97 of 100".
 *
 * `total` is every page a crawl fetched and kept, the ones that failed
 * included; never more than the plan crawls. `crawled` is the ones fetched
 * successfully, so ten pages with one failure read 9 of 10. Pages discovered
 * and never crawled, and files a crawl met, are not counted.
 */
export function crawlCounts(pages: Array<{ status: string; errorType?: string | null }>) {
  const held = crawledPagesOf(pages);
  const failed = held.filter((page) => page.status === "failed").length;
  return { total: held.length, crawled: held.length - failed, failed };
}
