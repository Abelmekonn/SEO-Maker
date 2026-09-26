/**
 * Quick Search: a lightweight inspection of one URL.
 *
 * What it does, and what it deliberately does not:
 *
 *  - Follows redirects (every hop SSRF-checked) and records them.
 *  - Reads the start of the page only: the head and the first part of the
 *    body, up to QUICK_MAX_BYTES. The rest of the page is never downloaded,
 *    so a Quick Search costs one short request however large the page is.
 *  - Checks robots.txt for the path, briefly.
 *  - Runs deterministic checks on what it read. Nothing is stored and no AI
 *    runs: a Deep Analysis (a project and a crawl) does the full job.
 *
 * When a check depends on the part of the page that was not read (an H1 far
 * down a very long page), it says "not found in the part read" rather than
 * "missing".
 */

import { assertSafeUrl } from "../net/safe-url";
import { fetchRobotsTxt, groupFor, isPathDisallowed } from "../robots";
import { type QuickHtml, parseQuickHtml } from "./parse";

export { decodeEntities, parseAttributes, parseQuickHtml, type QuickHtml } from "./parse";

/** Enough for the head and the start of the body on nearly every page. */
export const QUICK_MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = "SEO-Maker-Bot/0.1 (+https://seo-maker.app/bot)";
const HTML_TYPES = /^(text\/html|application\/xhtml\+xml)/i;

export type QuickCheckStatus = "pass" | "fail" | "warn" | "info";

export type QuickCheck = {
  id: string;
  label: string;
  status: QuickCheckStatus;
  detail: string;
};

export type QuickInspection = {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  redirects: Array<{ from: string; to: string; status: number }>;
  responseTimeMs: number | null;
  contentType: string | null;
  xRobotsTag: string | null;
  /** Bytes of HTML read. */
  bytesRead: number;
  /** The page was longer than what was read. */
  partial: boolean;
  https: boolean;
  html: QuickHtml | null;
  robotsTxt: { found: boolean; disallowed: boolean; url: string | null; outcome: string };
  indexable: boolean;
  checks: QuickCheck[];
  /** Why nothing could be inspected, when that happened. */
  error: string | null;
  inspectedAt: string;
};

export type QuickInspectOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  checkUrl?: (url: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Skip robots.txt (tests). */
  skipRobots?: boolean;
};

const defaultCheck = async (url: string) => {
  const result = await assertSafeUrl(url);
  return result.ok ? ({ ok: true } as const) : ({ ok: false, reason: result.reason } as const);
};

async function readStart(response: Response, maxBytes: number): Promise<{ text: string; bytes: number; partial: boolean }> {
  if (!response.body) return { text: "", bytes: 0, partial: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let partial = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength >= maxBytes) {
        chunks.push(value.subarray(0, maxBytes - total));
        total = maxBytes;
        partial = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Stop the download here: the rest of the page is never fetched.
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8").decode(merged), bytes: total, partial };
}

function sameUrl(a: string, b: string): boolean {
  const normalize = (value: string) => {
    try {
      const url = new URL(value);
      url.hash = "";
      return `${url.protocol}//${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "") || "/"}${url.search}`;
    } catch {
      return value;
    }
  };
  return normalize(a) === normalize(b);
}

function absolute(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** The deterministic checks, from what was read. Pure, for tests. */
export function quickChecks(input: {
  status: number | null;
  finalUrl: string;
  redirects: number;
  html: QuickHtml | null;
  partial: boolean;
  xRobotsTag: string | null;
  robotsDisallowed: boolean;
}): { checks: QuickCheck[]; indexable: boolean } {
  const { html, partial } = input;
  const checks: QuickCheck[] = [];
  const status = input.status ?? 0;
  const notInPart = partial ? " in the part of the page read" : "";

  checks.push(
    status >= 200 && status < 300
      ? { id: "status", label: "Page exists", status: "pass", detail: `Answered HTTP ${status}.` }
      : { id: "status", label: "Page exists", status: "fail", detail: input.status ? `Answered HTTP ${status}.` : "No answer." },
  );
  checks.push(
    input.finalUrl.startsWith("https:")
      ? { id: "https", label: "HTTPS", status: "pass", detail: "Served over HTTPS." }
      : { id: "https", label: "HTTPS", status: "fail", detail: "Served over plain HTTP." },
  );
  checks.push(
    input.redirects === 0
      ? { id: "redirects", label: "Redirects", status: "pass", detail: "No redirect." }
      : input.redirects === 1
        ? { id: "redirects", label: "Redirects", status: "info", detail: "One redirect before the page." }
        : { id: "redirects", label: "Redirects", status: "warn", detail: `A chain of ${input.redirects} redirects. Link to the final address directly.` },
  );

  if (!html) {
    return { checks, indexable: false };
  }

  checks.push(
    html.title
      ? {
          id: "title",
          label: "Title",
          status: html.titleCount > 1 ? "warn" : "pass",
          detail: html.titleCount > 1 ? `${html.titleCount} title elements; search engines use one.` : html.title,
        }
      : { id: "title", label: "Title", status: "fail", detail: `No title element${notInPart}.` },
  );
  checks.push(
    html.metaDescription
      ? { id: "meta", label: "Meta description", status: "pass", detail: html.metaDescription }
      : { id: "meta", label: "Meta description", status: "fail", detail: `No meta description${notInPart}.` },
  );
  checks.push(
    html.h1.length === 1
      ? { id: "h1", label: "H1", status: "pass", detail: html.h1[0] }
      : html.h1.length > 1
        ? { id: "h1", label: "H1", status: "info", detail: `${html.h1.length} H1 headings: ${html.h1.slice(0, 3).join(" · ")}` }
        : { id: "h1", label: "H1", status: partial ? "warn" : "fail", detail: `No H1 heading${notInPart}.` },
  );
  checks.push(
    html.h2.length > 0
      ? { id: "headings", label: "Subheadings", status: "pass", detail: `${html.h2.length} H2 and ${html.h3Count} H3 headings.` }
      : { id: "headings", label: "Subheadings", status: "warn", detail: `No H2 subheadings${notInPart}.` },
  );

  const canonical = absolute(html.canonical, input.finalUrl);
  const canonicalElsewhere = Boolean(canonical && !sameUrl(canonical, input.finalUrl));
  checks.push(
    !canonical
      ? { id: "canonical", label: "Canonical", status: "warn", detail: "No canonical link. Add one that points at this address." }
      : canonicalElsewhere
        ? { id: "canonical", label: "Canonical", status: "warn", detail: `Points to another address: ${canonical}` }
        : { id: "canonical", label: "Canonical", status: "pass", detail: "Points to this page." },
  );

  const noindex = /noindex/i.test(`${html.robotsMeta ?? ""} ${input.xRobotsTag ?? ""}`);
  const reasons: string[] = [];
  if (status >= 400 || status === 0) reasons.push(`it answers HTTP ${input.status ?? "nothing"}`);
  if (noindex) reasons.push(/noindex/i.test(input.xRobotsTag ?? "") ? "an X-Robots-Tag header says noindex" : "a robots meta tag says noindex");
  if (input.robotsDisallowed) reasons.push("robots.txt blocks crawling it");
  const indexable = reasons.length === 0;
  checks.push(
    indexable
      ? {
          id: "indexable",
          label: "Indexable",
          status: canonicalElsewhere ? "warn" : "pass",
          detail: canonicalElsewhere
            ? "Nothing blocks indexing, but the canonical points elsewhere, so search engines may index that address instead."
            : "Nothing on the page or in robots.txt blocks indexing.",
        }
      : { id: "indexable", label: "Indexable", status: "fail", detail: `Not indexable: ${reasons.join("; ")}.` },
  );

  checks.push(
    html.viewport
      ? { id: "viewport", label: "Mobile viewport", status: "pass", detail: html.viewport }
      : { id: "viewport", label: "Mobile viewport", status: "warn", detail: `No viewport meta tag${notInPart}.` },
  );
  checks.push(
    html.lang
      ? { id: "lang", label: "Language", status: "pass", detail: `lang="${html.lang}"` }
      : { id: "lang", label: "Language", status: "warn", detail: "No lang attribute on the html element." },
  );
  checks.push(
    html.structuredDataBlocks > 0
      ? {
          id: "schema",
          label: "Structured data",
          status: "pass",
          detail: html.structuredDataTypes.length ? html.structuredDataTypes.join(", ") : `${html.structuredDataBlocks} JSON-LD block(s).`,
        }
      : { id: "schema", label: "Structured data", status: "info", detail: `No JSON-LD${notInPart}.` },
  );
  checks.push(
    html.openGraph.title
      ? { id: "og", label: "Social preview", status: "pass", detail: html.openGraph.title }
      : { id: "og", label: "Social preview", status: "info", detail: "No Open Graph title; link previews fall back to the page title." },
  );
  if (html.imageCount > 0) {
    checks.push(
      html.imagesWithoutAlt === 0
        ? { id: "images", label: "Image alt text", status: "pass", detail: `All ${html.imageCount} images${notInPart} have an alt attribute.` }
        : {
            id: "images",
            label: "Image alt text",
            status: "warn",
            detail: `${html.imagesWithoutAlt} of ${html.imageCount} images${notInPart} have no alt attribute.`,
          },
    );
  }

  return { checks, indexable };
}

/** Inspects one URL. Never throws for a site problem: it reports it. */
export async function quickInspect(input: string, options: QuickInspectOptions = {}): Promise<QuickInspection> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const checkUrl = options.checkUrl ?? defaultCheck;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? QUICK_MAX_BYTES;
  const inspectedAt = new Date().toISOString();

  const redirects: QuickInspection["redirects"] = [];
  const failed = (finalUrl: string, error: string, status: number | null = null): QuickInspection => {
    const { checks } = quickChecks({ status, finalUrl, redirects: redirects.length, html: null, partial: false, xRobotsTag: null, robotsDisallowed: false });
    return {
      requestedUrl: input,
      finalUrl,
      status,
      redirects,
      responseTimeMs: null,
      contentType: null,
      xRobotsTag: null,
      bytesRead: 0,
      partial: false,
      https: finalUrl.startsWith("https:"),
      html: null,
      robotsTxt: { found: false, disallowed: false, url: null, outcome: "not checked" },
      indexable: false,
      checks,
      error,
      inspectedAt,
    };
  };

  let current = input;
  let response: Response | null = null;
  let started = 0;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const check = await checkUrl(current);
    if (!check.ok) {
      return failed(current, hop === 0 ? "That address is not a public website." : "A redirect pointed to an address that is not a public website.");
    }
    started = Date.now();
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return failed(current, timedOut ? `The page did not answer within ${Math.round(timeoutMs / 1000)} seconds.` : "The page could not be reached.");
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      const next = location ? absolute(location, current) : null;
      if (!next) return failed(current, `The page answered ${response.status} without a valid redirect address.`, response.status);
      redirects.push({ from: current, to: next, status: response.status });
      current = next;
      response = null;
      continue;
    }
    break;
  }
  if (!response) {
    return failed(current, `More than ${MAX_REDIRECTS} redirects.`);
  }

  const responseTimeMs = Date.now() - started;
  const contentType = response.headers.get("content-type");
  const xRobotsTag = response.headers.get("x-robots-tag")?.toLowerCase() ?? null;
  const finalUrl = current;

  const robotsPromise = options.skipRobots
    ? Promise.resolve(null)
    : fetchRobotsTxt(new URL(finalUrl).origin, { timeoutMs: 5_000, retries: 0, userAgent: USER_AGENT }).catch(() => null);

  let html: QuickHtml | null = null;
  let bytesRead = 0;
  let partial = false;
  let error: string | null = null;
  if (contentType && !HTML_TYPES.test(contentType)) {
    await response.body?.cancel().catch(() => {});
    error = `This address serves ${contentType.split(";")[0]}, not an HTML page.`;
  } else {
    const read = await readStart(response, maxBytes);
    bytesRead = read.bytes;
    partial = read.partial;
    html = parseQuickHtml(read.text);
  }

  const robots = await robotsPromise;
  let disallowed = false;
  try {
    disallowed = robots?.parsed ? isPathDisallowed(new URL(finalUrl).pathname, groupFor(robots.parsed)) : false;
  } catch {
    disallowed = false;
  }

  const { checks, indexable } = quickChecks({
    status: response.status,
    finalUrl,
    redirects: redirects.length,
    html,
    partial,
    xRobotsTag,
    robotsDisallowed: disallowed,
  });

  return {
    requestedUrl: input,
    finalUrl,
    status: response.status,
    redirects,
    responseTimeMs,
    contentType,
    xRobotsTag,
    bytesRead,
    partial,
    https: finalUrl.startsWith("https:"),
    html,
    robotsTxt: {
      found: robots?.outcome === "ok",
      disallowed,
      url: robots ? (robots.finalUrl ?? robots.url) : null,
      outcome: robots?.outcome ?? "not checked",
    },
    indexable,
    checks,
    error,
    inspectedAt,
  };
}
