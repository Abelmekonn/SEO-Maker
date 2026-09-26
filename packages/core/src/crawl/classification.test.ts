import { describe, expect, it } from "vitest";
import { UrlInventory, classifyInventory, classifyNewPages } from "./inventory";
import { pageKeyOf, pageKeysOf } from "./url";

const HOME = "https://example.com";

/** A site as discovery sees it: sitemap URLs and the homepage's links. */
function discovered(options: { sitemap: string[]; homeLinks: string[]; disallowed?: string[] }) {
  const inv = new UrlInventory({
    start: HOME,
    siteHost: "example.com",
    isDisallowed: (path) => (options.disallowed ?? []).some((prefix) => path.startsWith(prefix)),
    hasSitemap: true,
  });
  for (const url of options.sitemap) inv.add(url, "sitemap");
  for (const url of options.homeLinks) inv.add(url, "link", HOME);
  return inv;
}

describe("classifyInventory: a site's first classification", () => {
  it("stores every crawlable page once, capped by the plan's Priority limit, most important first", () => {
    const inv = discovered({
      sitemap: [`${HOME}/pricing`, `${HOME}/product`, `${HOME}/blog/one`, `${HOME}/blog/two`, `${HOME}/private/x`],
      homeLinks: [`${HOME}/pricing`, `${HOME}/product`],
      disallowed: ["/private"],
    });
    const pages = classifyInventory(inv.snapshot({ stage: "plan", priorityLimit: 2 }));

    // robots.txt blocks /private/x: it cannot be crawled, so it is not a page of the inventory.
    expect(pages.map((page) => page.path).sort()).toEqual(["/", "/blog/one", "/blog/two", "/pricing", "/product"]);
    expect(pages.filter((page) => page.tier === "priority")).toHaveLength(2);
    expect(pages[0]).toMatchObject({ path: "/", homepage: true, tier: "priority" });
    expect(pages.every((page) => page.pageKey === pageKeyOf(page.url))).toBe(true);
  });

  it("keeps two spellings of one page as one page", () => {
    const inv = discovered({ sitemap: [`${HOME}/about`, "https://www.example.com/about"], homeLinks: [] });
    const pages = classifyInventory(inv.snapshot({ stage: "plan", priorityLimit: 5 }));
    expect(pages.filter((page) => page.pageKey === "example.com/about")).toHaveLength(1);
  });
});

describe("classifyNewPages: a check for new pages", () => {
  const inv = discovered({
    sitemap: [`${HOME}/pricing`, `${HOME}/enterprise`, `${HOME}/blog/new-product`, `${HOME}/blog/old`],
    homeLinks: [`${HOME}/pricing`, `${HOME}/enterprise`],
  });
  const entries = inv.snapshot({ stage: "plan", priorityLimit: 10 });
  const known = new Set([pageKeyOf(HOME), pageKeyOf(`${HOME}/pricing`), pageKeyOf(`${HOME}/blog/old`)]);

  it("classifies only pages not known yet", () => {
    const fresh = classifyNewPages(entries, { knownKeys: known, knownPriority: 2, priorityLimit: 10 });
    expect(fresh.map((page) => page.path).sort()).toEqual(["/blog/new-product", "/enterprise"]);
    // Known pages are not returned, so nothing about them can change.
    expect(fresh.some((page) => known.has(page.pageKey))).toBe(false);
  });

  it("gives a new page Priority only while the plan's cap has room after the known Priority pages", () => {
    const withRoom = classifyNewPages(entries, { knownKeys: known, knownPriority: 2, priorityLimit: 10 });
    expect(withRoom.find((page) => page.path === "/enterprise")?.tier).toBe("priority");

    const full = classifyNewPages(entries, { knownKeys: known, knownPriority: 10, priorityLimit: 10 });
    const enterprise = full.find((page) => page.path === "/enterprise");
    expect(enterprise?.tier).toBe("standard");
    expect(enterprise?.autoTier).toBe("priority");
    expect(enterprise?.reasons[0]).toBe("Past the 10-page Priority limit");
  });

  it("finds nothing new when every page is known", () => {
    const all = new Set(entries.map((entry) => pageKeyOf(entry.url)));
    expect(classifyNewPages(entries, { knownKeys: all, knownPriority: 1, priorityLimit: 10 })).toEqual([]);
  });
});

describe("pageKeysOf", () => {
  it("matches a redirected page to the address it was requested at", () => {
    const keys = pageKeysOf({
      url: `${HOME}/pricing/`,
      finalUrl: `${HOME}/pricing/`,
      evidence: { redirectChain: [{ from: `${HOME}/plans`, to: `${HOME}/pricing/`, status: 301 }] },
    });
    expect(keys).toEqual(["example.com/pricing", "example.com/plans"]);
  });

  it("is the page's own key when it did not redirect", () => {
    expect(pageKeysOf({ url: "https://www.example.com/a", finalUrl: null, evidence: null })).toEqual(["example.com/a"]);
  });
});
