import { describe, expect, it } from "vitest";
import { QUICK_MAX_BYTES, parseQuickHtml, quickChecks, quickInspect } from "./index";

const PAGE = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>Acme Payments &amp; Billing</title>
  <meta name="description" content="Online payments for retailers.">
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <link rel="canonical" href="https://www.acme.test/">
  <meta property="og:title" content="Acme Payments">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"WebSite"}]}</script>
  <script>var h1 = "<h1>not a heading</h1>";</script>
</head>
<body>
  <!-- <h1>commented out</h1> -->
  <h1>Payments <em>for</em> retailers</h1>
  <h2>Why Acme</h2><h2>Pricing</h2><h3>Plans</h3>
  <img src="/a.png" alt="Checkout"><img src="/b.png"><img src="/c.png" alt="">
</body></html>`;

describe("parseQuickHtml", () => {
  const html = parseQuickHtml(PAGE);

  it("reads the head: title, description, viewport, canonical, lang, Open Graph", () => {
    expect(html.title).toBe("Acme Payments & Billing");
    expect(html.metaDescription).toBe("Online payments for retailers.");
    expect(html.viewport).toContain("width=device-width");
    expect(html.canonical).toBe("https://www.acme.test/");
    expect(html.lang).toBe("en-GB");
    expect(html.openGraph.title).toBe("Acme Payments");
  });

  it("reads headings, ignoring scripts and comments", () => {
    expect(html.h1).toEqual(["Payments for retailers"]);
    expect(html.h2).toEqual(["Why Acme", "Pricing"]);
    expect(html.h3Count).toBe(1);
  });

  it("finds structured data types, including inside @graph", () => {
    expect(html.structuredDataBlocks).toBe(1);
    expect(html.structuredDataTypes).toEqual(["Organization", "WebSite"]);
  });

  it("counts only a missing alt attribute as missing, not alt=\"\"", () => {
    expect(html.imageCount).toBe(3);
    expect(html.imagesWithoutAlt).toBe(1);
  });
});

describe("quickChecks", () => {
  const base = { status: 200, finalUrl: "https://www.acme.test/", redirects: 0, partial: false, xRobotsTag: null, robotsDisallowed: false };

  it("passes a well-formed page", () => {
    const { checks, indexable } = quickChecks({ ...base, html: parseQuickHtml(PAGE) });
    expect(indexable).toBe(true);
    expect(checks.find((check) => check.id === "title")?.status).toBe("pass");
    expect(checks.find((check) => check.id === "canonical")?.status).toBe("pass");
  });

  it("flags a missing description and a noindex page", () => {
    const html = parseQuickHtml('<html><head><title>x</title><meta name="robots" content="noindex, follow"></head><body><h1>x</h1></body></html>');
    const { checks, indexable } = quickChecks({ ...base, html });
    expect(checks.find((check) => check.id === "meta")?.status).toBe("fail");
    expect(indexable).toBe(false);
    expect(checks.find((check) => check.id === "indexable")?.detail).toMatch(/robots meta tag says noindex/);
  });

  it("treats a robots.txt block and an X-Robots-Tag as not indexable", () => {
    const html = parseQuickHtml(PAGE);
    expect(quickChecks({ ...base, html, robotsDisallowed: true }).indexable).toBe(false);
    expect(quickChecks({ ...base, html, xRobotsTag: "noindex" }).indexable).toBe(false);
  });

  it("says 'not found in the part read' instead of 'missing' on a partial page", () => {
    const { checks } = quickChecks({ ...base, html: parseQuickHtml("<html><head><title>x</title></head><body>"), partial: true });
    const h1 = checks.find((check) => check.id === "h1");
    expect(h1?.status).toBe("warn");
    expect(h1?.detail).toMatch(/part of the page read/);
  });

  it("does not claim one H1 is required", () => {
    const { checks } = quickChecks({ ...base, html: parseQuickHtml("<h1>a</h1><h1>b</h1>") });
    expect(checks.find((check) => check.id === "h1")?.status).toBe("info");
  });

  it("warns on a canonical pointing elsewhere", () => {
    const html = parseQuickHtml('<link rel="canonical" href="https://other.test/page">');
    expect(quickChecks({ ...base, html }).checks.find((check) => check.id === "canonical")?.status).toBe("warn");
  });
});

describe("quickInspect", () => {
  const allow = async () => ({ ok: true as const });

  it("follows redirects and reads the final page", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://acme.test/") return new Response(null, { status: 301, headers: { location: "https://www.acme.test/" } });
      return new Response(PAGE, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }) as typeof fetch;
    const result = await quickInspect("http://acme.test/", { fetchImpl, checkUrl: allow, skipRobots: true });
    expect(result.finalUrl).toBe("https://www.acme.test/");
    expect(result.redirects).toEqual([{ from: "http://acme.test/", to: "https://www.acme.test/", status: 301 }]);
    expect(result.html?.title).toBe("Acme Payments & Billing");
    expect(result.error).toBeNull();
  });

  it("stops reading at the byte cap instead of downloading the whole page", async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode(`<p>${"x".repeat(64 * 1024)}</p>`);
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const fetchImpl = (async () =>
      new Response(endless, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    const result = await quickInspect("https://huge.test/", { fetchImpl, checkUrl: allow, skipRobots: true });
    expect(result.partial).toBe(true);
    expect(result.bytesRead).toBe(QUICK_MAX_BYTES);
    // A few chunks of read-ahead at most, never the (endless) rest.
    expect(pulled).toBeLessThan(QUICK_MAX_BYTES * 2);
  });

  it("reports a non-HTML address without parsing it", async () => {
    const fetchImpl = (async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } })) as typeof fetch;
    const result = await quickInspect("https://acme.test/file.pdf", { fetchImpl, checkUrl: allow, skipRobots: true });
    expect(result.html).toBeNull();
    expect(result.error).toMatch(/application\/pdf/);
  });

  it("refuses a non-public address", async () => {
    const result = await quickInspect("http://10.0.0.1/", { checkUrl: async () => ({ ok: false, reason: "private-ip" }), skipRobots: true });
    expect(result.error).toMatch(/not a public website/);
    expect(result.checks.find((check) => check.id === "status")?.status).toBe("fail");
  });
});
