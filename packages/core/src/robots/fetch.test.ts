import { describe, expect, it } from "vitest";
import { buildRobotsAudit } from "./audit";
import { ROBOTS_MAX_BYTES, fetchRobotsTxt, looksLikeHtml } from "./fetch";
import { groupFor, isPathDisallowed } from "./parse";

/**
 * robots.txt fetching against a scripted network. Live behaviour (real
 * redirects on real sites) is checked separately; these pin the rules.
 */

type Route = { status: number; body?: string; headers?: Record<string, string> } | "network-error" | "timeout";

function network(routes: Record<string, Route | Route[]>) {
  const seen: string[] = [];
  const counts = new Map<string, number>();
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    const entry = routes[url];
    if (!entry) return new Response("not found", { status: 404 });
    const index = counts.get(url) ?? 0;
    counts.set(url, index + 1);
    const route = Array.isArray(entry) ? entry[Math.min(index, entry.length - 1)] : entry;
    if (route === "network-error") throw new TypeError("fetch failed");
    if (route === "timeout") {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    }
    return new Response(route.body ?? "", { status: route.status, headers: route.headers });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

const options = (fetchImpl: typeof fetch) => ({
  fetchImpl,
  checkUrl: async () => ({ ok: true as const }),
  sleep: async () => {},
});

const RULES = "User-agent: *\nDisallow: /admin\nSitemap: https://www.example.com/sitemap.xml\n";

describe("fetchRobotsTxt", () => {
  it("parses a plain 200", async () => {
    const { fetchImpl } = network({ "https://example.com/robots.txt": { status: 200, body: RULES, headers: { "content-type": "text/plain" } } });
    const result = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    expect(result.outcome).toBe("ok");
    expect(result.problem).toBeNull();
    expect(result.finalUrl).toBe("https://example.com/robots.txt");
    expect(result.redirects).toEqual([]);
    expect(isPathDisallowed("/admin/x", groupFor(result.parsed!))).toBe(true);
  });

  it("follows an http -> https -> www redirect chain and records every hop", async () => {
    const { fetchImpl, seen } = network({
      "http://example.com/robots.txt": { status: 301, headers: { location: "https://example.com/robots.txt" } },
      "https://example.com/robots.txt": { status: 308, headers: { location: "https://www.example.com/robots.txt" } },
      "https://www.example.com/robots.txt": { status: 200, body: RULES },
    });
    const result = await fetchRobotsTxt("http://example.com", options(fetchImpl));
    expect(result.outcome).toBe("ok");
    expect(result.finalUrl).toBe("https://www.example.com/robots.txt");
    expect(result.redirects.map((hop) => hop.status)).toEqual([301, 308]);
    expect(seen).toHaveLength(3);
    expect(result.parsed?.sitemaps).toEqual(["https://www.example.com/sitemap.xml"]);
  });

  it("resolves a relative Location against the current hop", async () => {
    const { fetchImpl } = network({
      "https://example.com/robots.txt": { status: 302, headers: { location: "/static/robots.txt" } },
      "https://example.com/static/robots.txt": { status: 200, body: RULES },
    });
    const result = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    expect(result.finalUrl).toBe("https://example.com/static/robots.txt");
    expect(result.outcome).toBe("ok");
  });

  it("follows five redirects and gives up on the sixth", async () => {
    const chain: Record<string, Route> = {};
    for (let index = 0; index < 6; index += 1) {
      const from = index === 0 ? "https://example.com/robots.txt" : `https://example.com/r${index}`;
      chain[from] = { status: 301, headers: { location: `https://example.com/r${index + 1}` } };
    }
    const tooMany = await fetchRobotsTxt("https://example.com", options(network(chain).fetchImpl));
    expect(tooMany.outcome).toBe("unavailable");
    expect(tooMany.problem).toBe("too-many-redirects");

    chain["https://example.com/r5"] = { status: 200, body: RULES };
    const five = await fetchRobotsTxt("https://example.com", options(network(chain).fetchImpl));
    expect(five.outcome).toBe("ok");
    expect(five.redirects).toHaveLength(5);
  });

  it("reports a redirect to the homepage as not a robots file, instead of parsing HTML", async () => {
    const { fetchImpl } = network({
      "https://example.com/robots.txt": { status: 301, headers: { location: "https://example.com/" } },
      "https://example.com/": { status: 200, body: "<!DOCTYPE html><html><body>Home</body></html>", headers: { "content-type": "text/html; charset=utf-8" } },
    });
    const result = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    expect(result.outcome).toBe("unavailable");
    expect(result.problem).toBe("not-a-robots-file");
    expect(result.parsed).toBeNull();
    expect(result.error).toMatch(/redirects to an HTML page/);
  });

  it("treats 404 as unavailable: no rules apply", async () => {
    const { fetchImpl } = network({});
    const result = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    expect(result.outcome).toBe("unavailable");
    expect(result.problem).toBe("not-found");
    expect(result.status).toBe(404);
  });

  it("treats 5xx as unreachable after one retry", async () => {
    const { fetchImpl, seen } = network({ "https://example.com/robots.txt": { status: 503 } });
    const result = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    expect(result.outcome).toBe("unreachable");
    expect(result.problem).toBe("server-error");
    expect(result.attempts).toBe(2);
    expect(seen).toHaveLength(2);
  });

  it("recovers when a transient failure clears on the retry", async () => {
    const { fetchImpl } = network({ "https://example.com/robots.txt": ["network-error", { status: 200, body: RULES }] });
    const result = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    expect(result.outcome).toBe("ok");
    expect(result.attempts).toBe(2);
  });

  it("reports a timeout distinctly from other network errors", async () => {
    const { fetchImpl } = network({ "https://example.com/robots.txt": "timeout" });
    const result = await fetchRobotsTxt("https://example.com", { ...options(fetchImpl), retries: 0 });
    expect(result.outcome).toBe("unreachable");
    expect(result.problem).toBe("timeout");
  });

  it("treats 429 like a server error, as search engines do", async () => {
    const { fetchImpl } = network({ "https://example.com/robots.txt": { status: 429 } });
    const result = await fetchRobotsTxt("https://example.com", { ...options(fetchImpl), retries: 0 });
    expect(result.outcome).toBe("unreachable");
    expect(result.problem).toBe("rate-limited");
  });

  it("stops at a redirect into a non-public address", async () => {
    const { fetchImpl } = network({
      "https://example.com/robots.txt": { status: 302, headers: { location: "http://169.254.169.254/robots.txt" } },
    });
    const result = await fetchRobotsTxt("https://example.com", {
      fetchImpl,
      checkUrl: async (url: string) => (url.includes("169.254") ? { ok: false as const, reason: "private-ip" } : { ok: true as const }),
      sleep: async () => {},
    });
    expect(result.outcome).toBe("unavailable");
    expect(result.problem).toBe("blocked-redirect");
  });

  it("keeps the first 500 KiB of an oversized file instead of rejecting it", async () => {
    const line = "Disallow: /private-path-that-is-long\n";
    const huge = `User-agent: *\n${line.repeat(Math.ceil((ROBOTS_MAX_BYTES * 1.5) / line.length))}`;
    const { fetchImpl } = network({ "https://example.com/robots.txt": { status: 200, body: huge } });
    const result = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    expect(result.outcome).toBe("ok");
    expect(result.truncated).toBe(true);
    expect(result.problem).toBe("truncated");
    expect(isPathDisallowed("/private-path-that-is-long", groupFor(result.parsed!))).toBe(true);
  });

  it("ignores a UTF-8 byte order mark", async () => {
    const { fetchImpl } = network({ "https://example.com/robots.txt": { status: 200, body: `﻿${RULES}` } });
    const result = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    expect(result.parsed?.warnings).toEqual([]);
    expect(isPathDisallowed("/admin", groupFor(result.parsed!))).toBe(true);
  });
});

describe("looksLikeHtml", () => {
  it("recognises HTML by content type or opening tag, not plain rules", () => {
    expect(looksLikeHtml("text/html", "User-agent: *")).toBe(true);
    expect(looksLikeHtml("text/plain", "  <!doctype html><html>")).toBe(true);
    expect(looksLikeHtml("text/plain", RULES)).toBe(false);
    expect(looksLikeHtml(null, "# comment <html> mentioned in a comment\nUser-agent: *")).toBe(false);
  });
});

describe("robots audit from a fetch", () => {
  it("carries where the file came from and what went wrong", async () => {
    const { fetchImpl } = network({
      "https://example.com/robots.txt": { status: 301, headers: { location: "https://www.example.com/robots.txt" } },
      "https://www.example.com/robots.txt": { status: 200, body: RULES },
    });
    const fetched = await fetchRobotsTxt("https://example.com", options(fetchImpl));
    const audit = buildRobotsAudit({
      url: fetched.url,
      status: fetched.status,
      parsed: fetched.parsed,
      group: fetched.parsed ? groupFor(fetched.parsed) : null,
      fetch: fetched,
    });
    expect(audit.found).toBe(true);
    expect(audit.finalUrl).toBe("https://www.example.com/robots.txt");
    expect(audit.redirects).toHaveLength(1);
    expect(audit.outcome).toBe("ok");
  });
});
