import { describe, expect, it } from "vitest";
import { buildRobotsAudit } from "./audit";
import { groupFor, isPathDisallowed, parseRobotsTxt } from "./parse";

/** Trimmed from the live stripe.com robots.txt used in the crawl test. */
const STRIPE = `Sitemap: https://stripe.com/sitemap/sitemap.xml

User-agent: ia_archiver
Allow: /docs/api
Allow: /docs/api$
Disallow: /docs
Disallow: /docs$
Disallow: /handoff

User-agent: *
Allow: /docs
Allow: /docs$
Disallow: /bitcoin/refund
Disallow: /unsupported-browser
Disallow: /handoff-healthcheck
Disallow: /handoff

User-agent: rogerbot
Crawl-delay: 2
`;

describe("parseRobotsTxt", () => {
  it("reads every group, not just the sitemap line", () => {
    const parsed = parseRobotsTxt(STRIPE);
    expect(parsed.groups).toHaveLength(3);
    expect(parsed.sitemaps).toEqual(["https://stripe.com/sitemap/sitemap.xml"]);
  });

  it("selects the wildcard group for our crawler", () => {
    const group = groupFor(parseRobotsTxt(STRIPE));
    expect(group?.agents).toEqual(["*"]);
    expect(group?.disallow).toContain("/handoff");
    expect(group?.allow).toContain("/docs");
  });

  it("obeys the disallow rules the old crawler ignored", () => {
    const group = groupFor(parseRobotsTxt(STRIPE));
    expect(isPathDisallowed("/handoff", group)).toBe(true);
    expect(isPathDisallowed("/unsupported-browser", group)).toBe(true);
    expect(isPathDisallowed("/payments", group)).toBe(false);
  });

  it("lets a longer Allow override a Disallow", () => {
    const group = groupFor(
      parseRobotsTxt("User-agent: *\nDisallow: /admin\nAllow: /admin/public\n"),
    );
    expect(isPathDisallowed("/admin/secret", group)).toBe(true);
    expect(isPathDisallowed("/admin/public/page", group)).toBe(false);
  });

  it("treats an empty Disallow as allow-all", () => {
    const group = groupFor(parseRobotsTxt("User-agent: *\nDisallow:\n"));
    expect(isPathDisallowed("/anything", group)).toBe(false);
  });

  it("supports * and $ wildcards", () => {
    const group = groupFor(
      parseRobotsTxt("User-agent: *\nDisallow: /*.php$\nDisallow: /a/*/b\n"),
    );
    expect(isPathDisallowed("/index.php", group)).toBe(true);
    expect(isPathDisallowed("/index.phpx", group)).toBe(false);
    expect(isPathDisallowed("/a/zzz/b", group)).toBe(true);
  });

  it("groups consecutive user-agent lines together", () => {
    const parsed = parseRobotsTxt("User-agent: a\nUser-agent: b\nDisallow: /x\n");
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].agents).toEqual(["a", "b"]);
  });

  it("prefers a crawler-specific group over the wildcard", () => {
    const group = groupFor(
      parseRobotsTxt("User-agent: *\nDisallow: /\n\nUser-agent: seo-maker-bot\nDisallow: /private\n"),
    );
    expect(isPathDisallowed("/", group)).toBe(false);
    expect(isPathDisallowed("/private", group)).toBe(true);
  });

  it("reports syntax problems instead of silently ignoring them", () => {
    const parsed = parseRobotsTxt("User-agent: *\nDisalow: /typo\nthis is not a directive\n");
    expect(parsed.warnings).toHaveLength(2);
  });

  it("flags directives that appear before any user-agent", () => {
    const parsed = parseRobotsTxt("Disallow: /x\nUser-agent: *\nDisallow: /y\n");
    expect(parsed.orphanDirectives).toBe(1);
  });
});

describe("buildRobotsAudit", () => {
  it("reports sitemap URLs that robots.txt blocks", () => {
    const parsed = parseRobotsTxt("User-agent: *\nDisallow: /handoff\nSitemap: https://x.com/s.xml");
    const audit = buildRobotsAudit({
      url: "https://x.com/robots.txt",
      status: 200,
      parsed,
      group: groupFor(parsed),
      sitemapUrls: ["https://x.com/handoff/a", "https://x.com/ok"],
    });

    expect(audit.found).toBe(true);
    expect(audit.hasSitemapDirective).toBe(true);
    expect(audit.blockedSitemapUrls).toEqual(["https://x.com/handoff/a"]);
    expect(audit.blocksEverything).toBe(false);
  });

  it("detects a site closed to our crawler", () => {
    const parsed = parseRobotsTxt("User-agent: *\nDisallow: /");
    const audit = buildRobotsAudit({
      url: "https://x.com/robots.txt",
      status: 200,
      parsed,
      group: groupFor(parsed),
    });
    expect(audit.blocksEverything).toBe(true);
  });

  it("marks an unreachable file as not found", () => {
    const audit = buildRobotsAudit({
      url: "https://x.com/robots.txt",
      status: 404,
      parsed: null,
      group: null,
    });
    expect(audit.found).toBe(false);
    expect(audit.valid).toBe(false);
  });
});
