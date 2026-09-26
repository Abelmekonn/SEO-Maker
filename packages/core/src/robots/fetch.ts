/**
 * Fetching robots.txt, following the Robots Exclusion Protocol (RFC 9309).
 *
 * What the RFC and search engines actually do, and what this implements:
 *
 *  - Redirects (3xx): follow at least five consecutive redirects, across
 *    hosts too (http -> https, apex -> www are the common ones). More than
 *    that, and the file is treated as unavailable.
 *  - 2xx: parse what came back. Only the first 500 KiB has to be parsed;
 *    a longer file is truncated there, not rejected.
 *  - 4xx: "unavailable". Crawlers may access anything; there are no rules.
 *  - 5xx, 429 and network errors or timeouts: "unreachable". The RFC says a
 *    crawler must then assume the whole site is disallowed. Transient
 *    failures are retried once before that conclusion is drawn.
 *  - A redirect that lands on an HTML page (a common misconfiguration: a
 *    missing robots.txt redirected to the homepage) is not a robots file.
 *    Its lines would all be invalid anyway, so it is reported as a problem
 *    and treated as unavailable, rather than parsed into a page of warnings.
 *
 * Every hop is checked by `checkUrl` (the SSRF guard) before it is fetched.
 */

import { assertSafeUrl } from "../net/safe-url";
import { type ParsedRobots, parseRobotsTxt } from "./parse";

/** RFC 9309 §2.5: parse at least 500 kibibytes. */
export const ROBOTS_MAX_BYTES = 500 * 1024;
/** RFC 9309 §2.3.1.2: follow at least five consecutive redirects. */
export const ROBOTS_MAX_REDIRECTS = 5;

/**
 * ok           2xx, parsed
 * unavailable  4xx, too many redirects, or not a robots file: no rules apply
 * unreachable  5xx, 429, network error, timeout: the RFC treats everything as disallowed
 */
export type RobotsOutcome = "ok" | "unavailable" | "unreachable";

export type RobotsProblem =
  | "not-found"
  | "client-error"
  | "server-error"
  | "rate-limited"
  | "timeout"
  | "network-error"
  | "too-many-redirects"
  | "redirect-without-location"
  | "blocked-redirect"
  | "not-a-robots-file"
  | "truncated";

export type RobotsRedirect = { from: string; to: string; status: number };

export type RobotsFetch = {
  /** The address asked for: <origin>/robots.txt. */
  url: string;
  /** Where the answer came from, after redirects. Null when nothing answered. */
  finalUrl: string | null;
  /** Status of the final response. Null on a network error. */
  status: number | null;
  redirects: RobotsRedirect[];
  outcome: RobotsOutcome;
  /** Null when the file was fetched and parsed cleanly. */
  problem: RobotsProblem | null;
  parsed: ParsedRobots | null;
  /** The file was longer than ROBOTS_MAX_BYTES; only the start was parsed. */
  truncated: boolean;
  contentType: string | null;
  /** Human-readable detail for the audit. */
  error: string | null;
  /** Fetches made, retries included. */
  attempts: number;
};

type UrlCheck = (url: string) => Promise<{ ok: true } | { ok: false; reason: string; detail?: string }>;

export type RobotsFetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  userAgent?: string;
  /** Retries of a transient failure (5xx, 429, timeout, network). Default 1. */
  retries?: number;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  checkUrl?: UrlCheck;
  sleep?: (ms: number) => Promise<void>;
};

const defaultCheck: UrlCheck = async (url) => {
  const result = await assertSafeUrl(url);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason, detail: result.detail };
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads a body up to `maxBytes`, keeping the start of a longer one instead of failing. */
async function readTruncated(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: "", truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - total));
        total = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text = new TextDecoder("utf-8").decode(merged);
  // A cut in the middle of a line leaves half a directive; drop it.
  if (truncated) {
    const lastBreak = text.lastIndexOf("\n");
    if (lastBreak > 0) text = text.slice(0, lastBreak);
  }
  return { text: text.replace(/^﻿/, ""), truncated };
}

/** HTML served where a robots file should be: by content type, or by what the body starts with. */
export function looksLikeHtml(contentType: string | null, body: string): boolean {
  if (contentType && /text\/html|application\/xhtml\+xml/i.test(contentType)) return true;
  return /^\s*(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(body.slice(0, 512));
}

type Attempt = Omit<RobotsFetch, "url" | "attempts">;

async function attempt(url: string, options: Required<Omit<RobotsFetchOptions, "retries" | "sleep">>): Promise<Attempt> {
  const redirects: RobotsRedirect[] = [];
  let current = url;

  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    const check = await options.checkUrl(current);
    if (!check.ok) {
      return {
        finalUrl: current,
        status: null,
        redirects,
        outcome: "unavailable",
        problem: "blocked-redirect",
        parsed: null,
        truncated: false,
        contentType: null,
        error: `A redirect pointed robots.txt at an address that is not a public website (${check.reason}).`,
      };
    }

    let response: Response;
    try {
      response = await options.fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: { "user-agent": options.userAgent, accept: "text/plain, */*;q=0.8" },
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return {
        finalUrl: current,
        status: null,
        redirects,
        outcome: "unreachable",
        problem: timedOut ? "timeout" : "network-error",
        parsed: null,
        truncated: false,
        contentType: null,
        error: timedOut
          ? `robots.txt did not answer within ${Math.round(options.timeoutMs / 1000)} seconds.`
          : `robots.txt could not be fetched: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300),
      };
    }

    const status = response.status;
    const contentType = response.headers.get("content-type");

    if (status >= 300 && status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      if (!location) {
        return {
          finalUrl: current,
          status,
          redirects,
          outcome: "unavailable",
          problem: "redirect-without-location",
          parsed: null,
          truncated: false,
          contentType,
          error: `robots.txt answered ${status} without saying where to go.`,
        };
      }
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return {
          finalUrl: current,
          status,
          redirects,
          outcome: "unavailable",
          problem: "redirect-without-location",
          parsed: null,
          truncated: false,
          contentType,
          error: `robots.txt redirected to an invalid address: ${location.slice(0, 200)}`,
        };
      }
      redirects.push({ from: current, to: next, status });
      current = next;
      continue;
    }

    if (status >= 500 || status === 429) {
      await response.body?.cancel().catch(() => {});
      return {
        finalUrl: current,
        status,
        redirects,
        outcome: "unreachable",
        problem: status === 429 ? "rate-limited" : "server-error",
        parsed: null,
        truncated: false,
        contentType,
        error: `robots.txt answered HTTP ${status}.`,
      };
    }

    if (status >= 400) {
      await response.body?.cancel().catch(() => {});
      return {
        finalUrl: current,
        status,
        redirects,
        outcome: "unavailable",
        problem: status === 404 || status === 410 ? "not-found" : "client-error",
        parsed: null,
        truncated: false,
        contentType,
        error: status === 404 || status === 410 ? null : `robots.txt answered HTTP ${status}.`,
      };
    }

    // 2xx (and anything else below 300): this is the file.
    const { text, truncated } = await readTruncated(response, options.maxBytes);
    if (looksLikeHtml(contentType, text)) {
      return {
        finalUrl: current,
        status,
        redirects,
        outcome: "unavailable",
        problem: "not-a-robots-file",
        parsed: null,
        truncated: false,
        contentType,
        error:
          redirects.length > 0
            ? `robots.txt redirects to an HTML page (${current}), not a robots file.`
            : "robots.txt answers with an HTML page, not a robots file.",
      };
    }
    return {
      finalUrl: current,
      status,
      redirects,
      outcome: "ok",
      problem: truncated ? "truncated" : null,
      parsed: parseRobotsTxt(text),
      truncated,
      contentType,
      error: truncated ? `robots.txt is larger than ${Math.round(options.maxBytes / 1024)} KiB; only the start was read.` : null,
    };
  }

  return {
    finalUrl: current,
    status: null,
    redirects,
    outcome: "unavailable",
    problem: "too-many-redirects",
    parsed: null,
    truncated: false,
    contentType: null,
    error: `robots.txt redirected more than ${options.maxRedirects} times.`,
  };
}

/** Transient: worth one more try before concluding the site is closed. */
function transient(result: Attempt): boolean {
  return result.outcome === "unreachable";
}

/**
 * Fetches and parses `<origin>/robots.txt`.
 *
 * Never throws: every outcome, including a network failure, comes back as a
 * result with an `outcome` and a `problem`, so a crawl can decide what to do
 * and the audit can say exactly what happened.
 */
export async function fetchRobotsTxt(origin: string, options: RobotsFetchOptions = {}): Promise<RobotsFetch> {
  const url = `${origin.replace(/\/+$/, "")}/robots.txt`;
  const resolved = {
    timeoutMs: options.timeoutMs ?? 10_000,
    maxRedirects: options.maxRedirects ?? ROBOTS_MAX_REDIRECTS,
    maxBytes: options.maxBytes ?? ROBOTS_MAX_BYTES,
    userAgent: options.userAgent ?? "SEO-Maker-Bot/0.1",
    fetchImpl: options.fetchImpl ?? fetch,
    checkUrl: options.checkUrl ?? defaultCheck,
  };
  const retries = options.retries ?? 1;
  const sleep = options.sleep ?? defaultSleep;

  let result = await attempt(url, resolved);
  let attempts = 1;
  while (transient(result) && attempts <= retries) {
    await sleep(1000 * attempts);
    result = await attempt(url, resolved);
    attempts += 1;
  }
  return { url, ...result, attempts };
}
