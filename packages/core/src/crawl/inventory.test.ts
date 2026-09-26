import { describe, expect, it } from "vitest";
import {
  type InventoryEntry,
  UrlInventory,
  inventoryFromPages,
  previewCrawlPlan,
  priorFromInventory,
  readInventory,
  readTierOverrides,
  selectCrawl,
  tierOverridesFor,
  toStoredInventory,
  MAX_INVENTORY_ENTRIES,
} from "./inventory";
import { classifyUrl } from "./url";

const HOME = "https://example.com";

function inventory(disallowed: string[] = [], hasSitemap = true) {
  return new UrlInventory({
    start: HOME,
    siteHost: "example.com",
    isDisallowed: (path) => disallowed.some((prefix) => path.startsWith(prefix)),
    hasSitemap,
  });
}

const byUrl = (entries: InventoryEntry[], url: string) => entries.find((entry) => entry.url === url)!;

describe("classifyUrl", () => {
  it("says why a URL is not a page", () => {
    expect(classifyUrl("https://example.com/a/")).toEqual({ url: "https://example.com/a", reason: null });
    expect(classifyUrl("https://example.com/report.pdf")).toEqual({ url: null, reason: "asset" });
    expect(classifyUrl("not a url")).toEqual({ url: null, reason: "invalid" });
    expect(classifyUrl("ftp://example.com/a")).toEqual({ url: null, reason: "invalid" });
  });
});

describe("UrlInventory eligibility", () => {
  it("sorts every discovered URL into one eligibility and counts each once", () => {
    const inv = inventory(["/private"]);
    expect(inv.add(`${HOME}/pricing`, "sitemap")).toBe("eligible");
    expect(inv.add(`${HOME}/private/area`, "sitemap")).toBe("blocked_by_robots");
    expect(inv.add("https://other.com/page", "sitemap")).toBe("external");
    expect(inv.add(`${HOME}/brochure.pdf`, "sitemap")).toBe("asset");
    expect(inv.add("::nonsense::", "sitemap")).toBe("invalid");
    expect(inv.add(`${HOME}/pricing/`, "sitemap")).toBe("duplicate");
    // The same external link on a second page is the same URL.
    expect(inv.add("https://other.com/page", "link", `${HOME}/pricing`)).toBe("external");

    const { counts, samples } = inv.summary({ priorityLimit: 3, maxPages: 10 });
    // The homepage (seed) and /pricing.
    expect(counts.eligible).toBe(2);
    expect(counts.blocked_by_robots).toBe(1);
    expect(counts.external).toBe(1);
    expect(counts.asset).toBe(1);
    expect(counts.invalid).toBe(1);
    expect(counts.duplicate).toBe(1);
    expect(samples.blocked_by_robots).toEqual([`${HOME}/private/area`]);
  });

  it("does not call the homepage a sitemap duplicate", () => {
    const inv = inventory();
    expect(inv.add(`${HOME}/`, "sitemap")).toBe("eligible");
    expect(inv.summary({ priorityLimit: 3, maxPages: 10 }).counts.duplicate).toBe(0);
  });

  it("keeps robots-blocked URLs in the inventory, untiered, instead of dropping them", () => {
    const inv = inventory(["/private"]);
    inv.add(`${HOME}/private/area`, "sitemap");
    const entries = inv.snapshot({ stage: "plan", priorityLimit: 3, tierOverrides: { "/private/area": "priority" } });
    const blocked = byUrl(entries, `${HOME}/private/area`);
    expect(blocked.eligibility).toBe("blocked_by_robots");
    expect(blocked.tier).toBeNull();
    expect(blocked.reasons[0]).toMatch(/robots\.txt/);
    expect(selectCrawl(entries, { budget: 10 }).standard).not.toContain(blocked.url);
  });

  it("does not treat noindex as a robots block", () => {
    const inv = inventory();
    inv.add(`${HOME}/pricing`, "sitemap");
    inv.setPrior(
      new Map([
        [
          `${HOME}/pricing`,
          { pageType: "pricing", typeConfidence: 0.75, indexable: false, statusCode: 200, canonicalElsewhere: false, inlinks: 3 },
        ],
      ]),
    );
    const entry = byUrl(inv.snapshot({ stage: "plan", priorityLimit: 3 }), `${HOME}/pricing`);
    expect(entry.eligibility).toBe("eligible");
    expect(entry.reasons).toContain("Asks not to be indexed (noindex)");
    expect(entry.tier).toBe("standard");
  });

  it("turns an eligible URL into a blocked one when a redirect tried to reach it", () => {
    const inv = inventory();
    inv.add(`${HOME}/old`, "sitemap");
    inv.addBlockedRedirect(`${HOME}/old`);
    expect(inv.get(`${HOME}/old`)?.eligibility).toBe("blocked_by_robots");
    const { counts } = inv.summary({ priorityLimit: 3, maxPages: 10 });
    expect(counts.eligible).toBe(1);
    expect(counts.blocked_by_robots).toBe(1);
  });
});

describe("UrlInventory importance", () => {
  function site() {
    const inv = inventory();
    for (const path of ["/pricing", "/about", "/blog/a/b/post-1", "/login", "/privacy", "/products/widget"]) {
      inv.add(`${HOME}${path}`, "sitemap");
    }
    // What the homepage links to.
    for (const path of ["/pricing", "/about", "/login", "/privacy"]) {
      inv.add(`${HOME}${path}`, "link", HOME);
    }
    return inv;
  }

  it("ranks the homepage first and explains every level", () => {
    const entries = site().snapshot({ stage: "plan", priorityLimit: 10 });
    expect(entries[0].url).toBe(HOME);
    expect(entries[0].level).toBe("high");

    const pricing = byUrl(entries, `${HOME}/pricing`);
    expect(pricing.level).toBe("high");
    expect(pricing.reasons).toEqual(
      expect.arrayContaining(["Linked from the homepage", "Pricing page (from its URL)", "In the sitemap"]),
    );

    expect(byUrl(entries, `${HOME}/login`).level).toBe("utility");
    expect(byUrl(entries, `${HOME}/privacy`).level).toBe("utility");
    // Deep, unlinked and of unknown type: nothing says it matters yet.
    expect(byUrl(entries, `${HOME}/blog/a/b/post-1`).level).toBe("low");
    // Commercial but not linked from the homepage.
    expect(byUrl(entries, `${HOME}/products/widget`).level).toBe("medium");
  });

  it("has one homepage: a query on the root path is a listing, not another homepage", () => {
    const inv = inventory();
    inv.add(`${HOME}/?p=2`, "link", HOME);
    const entries = inv.snapshot({ stage: "plan", priorityLimit: 3 });
    expect(entries.filter((entry) => entry.homepage).map((entry) => entry.url)).toEqual([HOME]);
    expect(byUrl(entries, `${HOME}?p=2`).importance).toBeLessThan(1);
  });

  it("is deterministic", () => {
    const a = site().snapshot({ stage: "plan", priorityLimit: 3 });
    const b = site().snapshot({ stage: "plan", priorityLimit: 3 });
    expect(a).toEqual(b);
  });

  it("never auto-promotes utility pages, even when the homepage links them", () => {
    const entries = site().snapshot({ stage: "plan", priorityLimit: 10 });
    expect(byUrl(entries, `${HOME}/login`).autoTier).toBe("standard");
    expect(byUrl(entries, `${HOME}/privacy`).autoTier).toBe("standard");
  });

  it("uses the last crawl's page type and link counts at plan time only", () => {
    const inv = inventory();
    inv.add(`${HOME}/x`, "sitemap");
    inv.setPrior(
      new Map([[`${HOME}/x`, { pageType: "product", typeConfidence: 0.9, indexable: true, statusCode: 200, canonicalElsewhere: false, inlinks: 12 }]]),
    );
    const plan = byUrl(inv.snapshot({ stage: "plan", priorityLimit: 3 }), `${HOME}/x`);
    expect(plan.pageType).toBe("product");
    expect(plan.typeSource).toBe("page");
    expect(plan.inlinks).toBe(12);

    const final = byUrl(inv.snapshot({ stage: "final", priorityLimit: 3 }), `${HOME}/x`);
    expect(final.inlinks).toBe(0);
  });

  it("prefers what fetching the page showed over its URL", () => {
    const inv = inventory();
    inv.add(`${HOME}/x`, "sitemap");
    inv.observe(`${HOME}/x`, {
      tier: "standard",
      statusCode: 404,
      indexable: false,
      canonicalElsewhere: false,
      pageType: "article",
      typeConfidence: 0.9,
    });
    const entry = byUrl(inv.snapshot({ stage: "final", priorityLimit: 3 }), `${HOME}/x`);
    expect(entry.crawled).toBe("standard");
    expect(entry.pageType).toBe("article");
    expect(entry.reasons).toContain("Answered HTTP 404");
    expect(entry.level).not.toBe("high");
  });
});

describe("automatic plan for a small business site", () => {
  it("picks the homepage and the commercial pages, and leaves the rest Standard", () => {
    const inv = inventory();
    for (const path of ["/services", "/pricing", "/about", "/contact", "/blog/article-1", "/blog/article-2"]) {
      inv.add(`${HOME}${path}`, "sitemap");
    }
    const entries = inv.snapshot({ stage: "plan", priorityLimit: 3 });
    const tiers = Object.fromEntries(entries.map((entry) => [entry.path, entry.tier]));
    expect(tiers).toEqual({
      "/": "priority",
      "/services": "priority",
      "/pricing": "priority",
      "/about": "standard",
      "/contact": "standard",
      "/blog/article-1": "standard",
      "/blog/article-2": "standard",
    });
  });

  it("honours the user moving /about to Priority before the crawl", () => {
    const inv = inventory();
    for (const path of ["/services", "/pricing", "/about", "/contact"]) inv.add(`${HOME}${path}`, "sitemap");
    const entries = inv.snapshot({ stage: "plan", priorityLimit: 10, tierOverrides: { "/about": "priority" } });
    expect(byUrl(entries, `${HOME}/about`).tier).toBe("priority");
    expect(byUrl(entries, `${HOME}/contact`).tier).toBe("standard");
  });
});

describe("resolveTiers via snapshot", () => {
  function highs(count: number) {
    const inv = inventory();
    for (let i = 0; i < count; i += 1) {
      inv.add(`${HOME}/pricing-${i}`, "sitemap");
      inv.add(`${HOME}/pricing-${i}`, "link", HOME);
    }
    inv.add(`${HOME}/about`, "sitemap");
    inv.add(`${HOME}/deep/a/b/c`, "sitemap");
    return inv;
  }

  it("caps Priority at the plan limit and says why the rest are Standard", () => {
    const entries = highs(5).snapshot({ stage: "plan", priorityLimit: 3 });
    const priority = entries.filter((entry) => entry.tier === "priority");
    expect(priority).toHaveLength(3);
    expect(priority[0].url).toBe(HOME);
    const cut = entries.filter((entry) => entry.autoTier === "priority" && entry.tier === "standard");
    expect(cut.length).toBeGreaterThan(0);
    for (const entry of cut) expect(entry.reasons[0]).toBe("Past the 3-page Priority limit");
  });

  it("does not promote Standard pages to fill the cap", () => {
    const inv = inventory();
    inv.add(`${HOME}/deep/a/b/one`, "sitemap");
    inv.add(`${HOME}/deep/a/b/two`, "sitemap");
    const entries = inv.snapshot({ stage: "plan", priorityLimit: 3 });
    expect(entries.filter((entry) => entry.tier === "priority").map((entry) => entry.url)).toEqual([HOME]);
  });

  it("puts the user's Priority pages first, within the cap", () => {
    const entries = highs(5).snapshot({
      stage: "plan",
      priorityLimit: 3,
      tierOverrides: { "/about": "priority" },
    });
    const priority = entries.filter((entry) => entry.tier === "priority").map((entry) => entry.path);
    expect(priority).toHaveLength(3);
    expect(priority).toContain("/about");
    expect(byUrl(entries, `${HOME}/about`).reasons[0]).toBe("Priority set by you");
  });

  it("lets the user demote a page, including the homepage", () => {
    const entries = highs(1).snapshot({
      stage: "plan",
      priorityLimit: 3,
      tierOverrides: { "/": "standard" },
    });
    expect(byUrl(entries, HOME).tier).toBe("standard");
    expect(byUrl(entries, HOME).reasons[0]).toBe("Standard set by you");
  });

  it("never gives more Priority pages than the cap, however many the user picks", () => {
    const overrides = Object.fromEntries(["/about", "/deep/a/b/c", "/pricing-0", "/pricing-1"].map((path) => [path, "priority" as const]));
    const entries = highs(3).snapshot({ stage: "plan", priorityLimit: 3, tierOverrides: overrides });
    expect(entries.filter((entry) => entry.tier === "priority")).toHaveLength(3);
  });
});

describe("selectCrawl", () => {
  it("fetches Priority first, then spreads the Standard budget across sections", () => {
    const inv = inventory();
    inv.add(`${HOME}/pricing`, "link", HOME);
    for (let i = 0; i < 40; i += 1) inv.add(`${HOME}/blog/post-${i}`, "sitemap");
    for (let i = 0; i < 3; i += 1) inv.add(`${HOME}/docs/page-${i}`, "sitemap");
    const entries = inv.snapshot({ stage: "plan", priorityLimit: 3 });
    const selection = selectCrawl(entries, { budget: 9, exclude: new Set([HOME]) });

    expect(selection.priority).toEqual([`${HOME}/pricing`]);
    expect(selection.standard).toHaveLength(8);
    expect(selection.standard.filter((url) => url.includes("/docs/"))).toHaveLength(3);
    expect(selection.deferred).toBe(44 - 1 - 8);
    expect(selection.standard).not.toContain(HOME);
  });

  it("spends the whole budget when one section is all there is", () => {
    const inv = inventory();
    for (let i = 0; i < 20; i += 1) inv.add(`${HOME}/blog/post-${i}`, "sitemap");
    const entries = inv.snapshot({ stage: "plan", priorityLimit: 3 });
    expect(selectCrawl(entries, { budget: 10, exclude: new Set([HOME]) }).standard).toHaveLength(10);
  });
});

describe("storage and preview", () => {
  function stored() {
    const inv = inventory();
    inv.add(`${HOME}/pricing`, "link", HOME);
    inv.add(`${HOME}/about`, "sitemap");
    inv.add(`${HOME}/deep/a/b/c`, "sitemap");
    inv.observe(HOME, { tier: "priority", statusCode: 200, indexable: true, canonicalElsewhere: false, pageType: "homepage", typeConfidence: 1 });
    const entries = inv.snapshot({ stage: "final", priorityLimit: 3 });
    return toStoredInventory(entries, inv.summary({ priorityLimit: 3, maxPages: 10 }));
  }

  it("round-trips through JSON", () => {
    const value = JSON.parse(JSON.stringify(stored()));
    const read = readInventory(value);
    expect(read?.entries).toHaveLength(4);
    expect(read?.priorityLimit).toBe(3);
    expect(readInventory(null)).toBeNull();
    expect(readInventory({ entries: "nope" })).toBeNull();
  });

  it("stores only the user's departures from the automatic plan", () => {
    const inventoryRow = stored();
    const preview = previewCrawlPlan(inventoryRow, { priorityLimit: 3 });
    const auto = preview.filter((entry) => entry.tier === "priority").map((entry) => entry.path);
    expect(tierOverridesFor(preview, auto)).toEqual({});

    const overrides = tierOverridesFor(preview, ["/", "/about"]);
    expect(overrides).toEqual({ "/about": "priority", "/pricing": "standard" });

    const next = previewCrawlPlan(inventoryRow, { priorityLimit: 3, tierOverrides: overrides });
    expect(next.filter((entry) => entry.tier === "priority").map((entry) => entry.path).sort()).toEqual(["/", "/about"]);
  });

  it("reads overrides defensively", () => {
    expect(readTierOverrides({ "/a": "priority", "/b": "nope", "/c": "standard" })).toEqual({ "/a": "priority", "/c": "standard" });
    expect(readTierOverrides(["/a"])).toEqual({});
  });

  it("keeps fetched and user-chosen URLs when it has to truncate", () => {
    const inv = inventory();
    for (let i = 0; i < MAX_INVENTORY_ENTRIES + 50; i += 1) inv.add(`${HOME}/deep/a/b/page-${i}`, "sitemap");
    const lastUrl = `${HOME}/deep/a/b/page-${MAX_INVENTORY_ENTRIES + 49}`;
    inv.observe(lastUrl, { tier: "standard", statusCode: 200, indexable: true, canonicalElsewhere: false, pageType: "other", typeConfidence: 0.2 });
    const entries = inv.snapshot({ stage: "final", priorityLimit: 3 });
    const kept = toStoredInventory(entries, inv.summary({ priorityLimit: 3, maxPages: 10 }));
    expect(kept.entries).toHaveLength(MAX_INVENTORY_ENTRIES);
    expect(kept.truncated).toBe(51);
    expect(kept.entries.some((entry) => entry.url === lastUrl)).toBe(true);
  });

  it("carries what a crawl saw into the next one", () => {
    const prior = priorFromInventory(stored());
    expect(prior.get(HOME)?.pageType).toBe("homepage");
    expect(prior.get(`${HOME}/pricing`)?.inlinks).toBe(1);
  });

  it("rebuilds an inventory from the page rows of an older crawl", () => {
    const rebuilt = inventoryFromPages(
      [
        { url: HOME, finalUrl: null, status: "analyzed", statusCode: 200, pageType: "homepage", pageTypeScore: 1, indexable: true, canonicalUrl: HOME, inSitemap: true },
        { url: `${HOME}/pricing`, finalUrl: null, status: "analyzed", statusCode: 200, pageType: "pricing", pageTypeScore: 0.75, indexable: true, canonicalUrl: `${HOME}/plans`, inSitemap: true },
      ],
      { start: HOME, siteHost: "example.com" },
    );
    const preview = previewCrawlPlan(rebuilt, { priorityLimit: 3 });
    expect(preview[0].url).toBe(HOME);
    expect(byUrl(preview, `${HOME}/pricing`).reasons).toContain("Canonical points to another URL");
  });
});

describe("the start URL on a one-page plan", () => {
  it("keeps the Priority slot when the sitemap lists the homepage under another scheme", () => {
    // Found live on stripe.com: the crawl starts at http:// (as the user typed
    // it), the sitemap lists https://. Both are "the homepage"; the https one
    // used to win on sitemap presence, and the only page on Free was Standard.
    const start = "http://example.com";
    const inv = new UrlInventory({ start, siteHost: "example.com", isDisallowed: () => false, hasSitemap: true });
    inv.add("https://example.com", "sitemap");
    inv.add("https://example.com/pricing", "sitemap");
    const entries = inv.snapshot({ priorityLimit: 1, stage: "plan" });
    expect(byUrl(entries, start).tier).toBe("priority");
    expect(byUrl(entries, "https://example.com").tier).toBe("standard");
  });
});
