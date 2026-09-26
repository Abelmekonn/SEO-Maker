import {
  type CrawlTier,
  type DiscoverySummary,
  type StoredInventory,
  classifyInventory,
  hostKey,
  inventoryFromPages,
  normalizePageUrl,
  pageKeysOf,
  previewCrawlPlan,
  readInventory,
  readTierOverrides,
} from "@seo-maker/core/crawl";
import { type Page, Prisma, type SitePage, prisma } from "@seo-maker/db";
import type { PlanLimits } from "@/lib/plan";

/**
 * The site's page inventory (SitePage): every page discovery found, with the
 * Priority / Standard classification it was given when it was found.
 *
 *   discover -> classify (once) -> the user chooses what to crawl -> crawl
 *
 * Page statistics count against this inventory, not against the plan's page
 * limit: "97 of 104" means 97 of the 104 pages SEO Maker knows this site has.
 */

export type { DiscoverySummary };

/** Classification scope for page statistics: one tier, or every page. */
export type TierScope = "priority" | "standard" | "general";

/**
 * A crawled page with its classification from the inventory, and the key of
 * its inventory entry (null when the inventory does not list it).
 */
export type TieredPage = Page & { tier: CrawlTier; inventoryKey: string | null };

export function priorityLimitFor(limits: PlanLimits): number {
  return Math.min(limits.priorityPages, limits.maxPages);
}

type InventoryProject = {
  id: string;
  rootUrl: string;
  latestCrawlId: string | null;
  pagePriorityOverrides: unknown;
};

/**
 * The inventory, most important first. A project crawled before inventories
 * were stored has none: it is built once, here, from its latest crawl, with
 * the tiers that crawl used and the choices the user had made, so opening an
 * old site never re-classifies it.
 */
export async function loadInventory(project: InventoryProject, limits: PlanLimits): Promise<SitePage[]> {
  const rows = await prisma.sitePage.findMany({
    where: { projectId: project.id },
    orderBy: [{ tier: "asc" }, { homepage: "desc" }, { createdAt: "asc" }],
  });
  if (rows.length > 0 || !project.latestCrawlId) return rows;

  const inventory = await latestInventory(project);
  if (!inventory) return rows;
  const overrides = readTierOverrides(project.pagePriorityOverrides);
  const entries = previewCrawlPlan(inventory, { tierOverrides: overrides, priorityLimit: priorityLimitFor(limits) });
  const pages = classifyInventory(entries);
  const chosen = new Set(entries.filter((entry) => entry.userTier).map((entry) => entry.url));
  if (pages.length > 0) {
    await prisma.sitePage.createMany({
      data: pages.map((page) => ({
        projectId: project.id,
        url: page.url,
        pageKey: page.pageKey,
        path: page.path,
        homepage: page.homepage,
        tier: page.tier,
        tierSource: chosen.has(page.url) ? "user" : "auto",
        autoTier: page.autoTier,
        level: page.level,
        pageType: page.pageType,
        reasons: page.reasons as Prisma.InputJsonValue,
        sources: page.sources as Prisma.InputJsonValue,
        inSitemap: page.inSitemap,
      })),
      skipDuplicates: true,
    });
    await markCrawledFromLatest(project.id, project.latestCrawlId);
  }
  return prisma.sitePage.findMany({
    where: { projectId: project.id },
    orderBy: [{ tier: "asc" }, { homepage: "desc" }, { createdAt: "asc" }],
  });
}

/** Seeds `lastCrawledAt` from the crawl an inventory was just built from. */
async function markCrawledFromLatest(projectId: string, crawlId: string) {
  const pages = await prisma.page.findMany({
    where: { crawlId, status: { not: "pending" } },
    select: { url: true, finalUrl: true, evidence: true, createdAt: true },
  });
  for (const page of pages) {
    await prisma.sitePage.updateMany({
      where: { projectId, pageKey: { in: pageKeysOf(page) } },
      data: { lastCrawledAt: page.createdAt },
    });
  }
}

/** The latest crawl's stored inventory; rebuilt from its pages when it stored none. */
async function latestInventory(project: InventoryProject): Promise<StoredInventory | null> {
  if (!project.latestCrawlId) return null;
  const row = await prisma.crawlInventory.findUnique({
    where: { crawlId: project.latestCrawlId },
    select: { data: true },
  });
  const stored = readInventory(row?.data);
  if (stored) return stored;

  const start = normalizePageUrl(project.rootUrl);
  if (!start) return null;
  const pages = await prisma.page.findMany({
    where: { crawlId: project.latestCrawlId },
    select: {
      url: true,
      finalUrl: true,
      status: true,
      statusCode: true,
      pageType: true,
      pageTypeScore: true,
      indexable: true,
      canonicalUrl: true,
      inSitemap: true,
      robotsDisallowed: true,
    },
  });
  if (pages.length === 0) return null;
  return inventoryFromPages(pages, { start, siteHost: hostKey(new URL(start).hostname) });
}

/** One inventory page as the page lists show it. */
export type InventoryRow = {
  pageKey: string;
  url: string;
  path: string;
  homepage: boolean;
  tier: CrawlTier;
  tierSource: string;
  pageType: string | null;
  level: string;
  /** ISO time a crawl last fetched it. Null: never crawled. */
  lastCrawledAt: string | null;
};

export function toInventoryRows(rows: SitePage[]): InventoryRow[] {
  return rows.map((row) => ({
    pageKey: row.pageKey,
    url: row.url,
    path: row.path,
    homepage: row.homepage,
    tier: row.tier === "priority" ? "priority" : "standard",
    tierSource: row.tierSource,
    pageType: row.pageType,
    level: row.level,
    lastCrawledAt: row.lastCrawledAt?.toISOString() ?? null,
  }));
}

/** Inventory entries by page key, for matching crawled pages to their classification. */
function byKey(inventory: Pick<SitePage, "pageKey" | "tier">[]) {
  return new Map(inventory.map((row) => [row.pageKey, row]));
}

/**
 * Crawled pages with their classification. The inventory decides: a page the
 * user made Priority since it was crawled reads as Priority now. A page the
 * inventory does not list keeps the tier it was crawled at.
 */
export function withTiers(pages: Page[], inventory: Pick<SitePage, "pageKey" | "tier">[]): TieredPage[] {
  const index = byKey(inventory);
  return pages.map((page) => {
    const entry = pageKeysOf(page)
      .map((key) => index.get(key))
      .find(Boolean);
    const tier: CrawlTier = entry ? (entry.tier === "priority" ? "priority" : "standard") : page.crawlTier === "standard" ? "standard" : "priority";
    return { ...page, tier, inventoryKey: entry?.pageKey ?? null };
  });
}

/** Pages in a scope. General is every page. */
export function inScope<T extends { tier: CrawlTier }>(rows: T[], scope: TierScope): T[] {
  return scope === "general" ? rows : rows.filter((row) => row.tier === scope);
}

/** Inventory pages the latest crawl holds no row for: known, and not crawled. */
export function uncrawledPages(inventory: SitePage[], pages: Page[]): InventoryRow[] {
  const crawled = new Set(pages.flatMap(pageKeysOf));
  return toInventoryRows(inventory.filter((row) => !crawled.has(row.pageKey)));
}

export { crawlCounts, crawledPagesOf } from "@/lib/crawl-counts";

/** The discovery summary stored on the project, read without trusting its shape. */
export function readDiscovery(value: unknown): DiscoverySummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DiscoverySummary>;
  if (raw.mode !== "initial" && raw.mode !== "new-pages") return null;
  return {
    mode: raw.mode,
    at: typeof raw.at === "string" ? raw.at : new Date(0).toISOString(),
    total: Number(raw.total) || 0,
    priority: Number(raw.priority) || 0,
    standard: Number(raw.standard) || 0,
    added: Array.isArray(raw.added) ? raw.added.filter((row) => row && typeof row.url === "string") : [],
    addedNotListed: Number(raw.addedNotListed) || 0,
    sitemapUrls: Number(raw.sitemapUrls) || 0,
    robotsFound: Boolean(raw.robotsFound),
    homepageError: typeof raw.homepageError === "string" ? raw.homepageError : null,
    counts: {
      eligible: 0,
      blocked_by_robots: 0,
      invalid: 0,
      duplicate: 0,
      asset: 0,
      external: 0,
      ...(raw.counts ?? {}),
    },
  };
}

export type DiscoveryState = {
  status: "idle" | "queued" | "running" | "done" | "failed";
  mode: "initial" | "new-pages" | null;
  error: string | null;
  at: string | null;
  result: DiscoverySummary | null;
};

export function discoveryState(project: {
  discoveryStatus: string;
  discoveryMode: string | null;
  discoveryError: string | null;
  discoveryAt: Date | null;
  discoveryResult: unknown;
}): DiscoveryState {
  const status = (["idle", "queued", "running", "done", "failed"] as const).find((value) => value === project.discoveryStatus) ?? "idle";
  return {
    status,
    mode: project.discoveryMode === "initial" || project.discoveryMode === "new-pages" ? project.discoveryMode : null,
    error: project.discoveryError,
    at: project.discoveryAt?.toISOString() ?? null,
    result: readDiscovery(project.discoveryResult),
  };
}
