import { prisma } from "@seo-maker/db";
import { listSites } from "@/lib/sites";

/**
 * Dashboard search: the user's sites, the pages of those sites (latest crawl
 * only, so a result is never a page that no longer exists), and the product's
 * own screens and settings. Everything is matched on the server; pages are
 * paginated because a workspace can hold thousands of them.
 */

export type SearchSite = { id: string; name: string; host: string; status: string };
export type SearchPage = {
  id: string;
  projectId: string;
  siteName: string;
  path: string;
  title: string | null;
  pageType: string | null;
  crawlTier: string | null;
};
export type SearchDestination = { id: string; label: string; description: string; href: string; group: "Workspace" | "Site" };

export type SearchResult = {
  q: string;
  sites: SearchSite[];
  pages: { items: SearchPage[]; total: number; offset: number; limit: number };
  destinations: SearchDestination[];
};

const SITE_LIMIT = 5;
const PAGE_LIMIT = 8;
const MIN_QUERY = 2;

/** Screens and settings, with the words people might type for them. */
const WORKSPACE: Array<SearchDestination & { keywords: string[] }> = [
  { id: "dashboard", label: "Dashboard", description: "Your workspace overview", href: "/dashboard", group: "Workspace", keywords: ["home", "overview", "workspace"] },
  { id: "sites", label: "Sites", description: "Every site you have added", href: "/sites", group: "Workspace", keywords: ["projects", "websites", "all sites"] },
  { id: "quick-search", label: "Quick Search", description: "Inspect any URL in seconds", href: "/quick-search", group: "Workspace", keywords: ["inspect", "check url", "lookup", "quick"] },
  { id: "new", label: "Add a website", description: "Start a Deep Analysis of a new site", href: "/projects/new", group: "Workspace", keywords: ["new project", "create", "add site", "deep analysis"] },
  { id: "plans", label: "Plans and pricing", description: "What each plan includes", href: "/pricing", group: "Workspace", keywords: ["upgrade", "billing", "subscription", "pro", "agency", "free"] },
];

const SITE_SCREENS: Array<{ id: string; label: string; description: string; path: string; keywords: string[] }> = [
  { id: "overview", label: "Overview", description: "Scores and problems", path: "", keywords: ["summary", "score"] },
  { id: "pages", label: "Pages", description: "Every crawled page and its checks", path: "/pages", keywords: ["urls", "checks", "audit"] },
  { id: "performance", label: "Performance", description: "PageSpeed and Core Web Vitals", path: "/performance", keywords: ["speed", "lcp", "cls", "core web vitals", "pagespeed"] },
  { id: "page-ai", label: "Page Analysis", description: "AI recommendations for one page", path: "/ai/pages", keywords: ["ai", "metadata", "title", "meta description", "headings", "schema", "alt text", "internal links", "content"] },
  { id: "site-ai", label: "Site Strategy", description: "AI strategy for the whole site", path: "/ai/site", keywords: ["ai", "content strategy", "topics", "architecture", "internal linking"] },
  { id: "competitor-ai", label: "Competitor Analysis", description: "AI comparison with competitors", path: "/ai/competitors", keywords: ["ai", "competitors", "gaps", "comparison"] },
  { id: "competitors", label: "Competitors", description: "Tracked competitors", path: "/competitors", keywords: ["rivals"] },
  { id: "opportunities", label: "Opportunities", description: "Ranked site-wide actions", path: "/opportunities", keywords: ["actions", "to do"] },
  { id: "settings", label: "Site settings", description: "Business context and page types", path: "/settings", keywords: ["settings", "business context", "deep", "delete"] },
];

function matches(q: string, ...fields: string[]): boolean {
  const needle = q.toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(needle));
}

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

type PageRow = {
  id: string;
  projectId: string;
  siteName: string;
  url: string;
  finalUrl: string | null;
  title: string | null;
  pageType: string | null;
  crawlTier: string | null;
};

export async function searchWorkspace(
  userId: string,
  input: { q: string; projectId?: string | null; offset?: number; limit?: number },
): Promise<SearchResult> {
  const q = input.q.trim().slice(0, 100);
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(20, Math.max(1, Math.floor(input.limit ?? PAGE_LIMIT)));
  if (q.length < MIN_QUERY) {
    return { q, sites: [], pages: { items: [], total: 0, offset, limit }, destinations: [] };
  }
  const pattern = likePattern(q);

  const [sites, pages, counted, current] = await Promise.all([
    offset === 0 ? listSites(userId, { q, sort: "recent", pageSize: SITE_LIMIT }) : null,
    prisma.$queryRaw<PageRow[]>`
      SELECT pg."id", pg."projectId", pr."name" AS "siteName", pg."url", pg."finalUrl", pg."title", pg."pageType", pg."crawlTier"
      FROM "Page" pg
      JOIN "Project" pr ON pr."latestCrawlId" = pg."crawlId"
      WHERE pr."userId" = ${userId}
        AND (pg."url" ILIKE ${pattern} OR pg."finalUrl" ILIKE ${pattern} OR pg."title" ILIKE ${pattern} OR pg."h1" ILIKE ${pattern})
      ORDER BY (pg."title" ILIKE ${pattern}) DESC, LENGTH(pg."url") ASC, pg."id" ASC
      LIMIT ${limit} OFFSET ${offset}`,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Page" pg
      JOIN "Project" pr ON pr."latestCrawlId" = pg."crawlId"
      WHERE pr."userId" = ${userId}
        AND (pg."url" ILIKE ${pattern} OR pg."finalUrl" ILIKE ${pattern} OR pg."title" ILIKE ${pattern} OR pg."h1" ILIKE ${pattern})`,
    input.projectId
      ? prisma.project.findFirst({ where: { id: input.projectId, userId }, select: { id: true, name: true } })
      : null,
  ]);

  const destinations: SearchDestination[] =
    offset === 0
      ? [
          ...WORKSPACE.filter((entry) => matches(q, entry.label, entry.description, ...entry.keywords)).map((entry) => ({
            id: entry.id,
            label: entry.label,
            description: entry.description,
            href: entry.href,
            group: entry.group,
          })),
          ...(current
            ? SITE_SCREENS.filter((screen) => matches(q, screen.label, screen.description, ...screen.keywords)).map((screen) => ({
                id: `${current.id}:${screen.id}`,
                label: screen.label,
                description: `${current.name} · ${screen.description}`,
                href: `/projects/${current.id}${screen.path}`,
                group: "Site" as const,
              }))
            : []),
        ].slice(0, 8)
      : [];

  return {
    q,
    sites: (sites?.items ?? []).map((site) => ({ id: site.id, name: site.name, host: site.host, status: site.status })),
    pages: {
      items: pages.map((page) => ({
        id: page.id,
        projectId: page.projectId,
        siteName: page.siteName,
        path: pathOf(page.finalUrl ?? page.url),
        title: page.title,
        pageType: page.pageType,
        crawlTier: page.crawlTier,
      })),
      total: Number(counted[0]?.count ?? 0),
      offset,
      limit,
    },
    destinations,
  };
}


