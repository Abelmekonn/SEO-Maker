/**
 * Loads Site Intelligence from the database (Phase 3.1).
 *
 * The shape itself is computed by `buildSiteIntelligence` in core, which is
 * pure. This is the one place that decides which rows feed it: the project's
 * latest complete crawl, that crawl's persisted issues, and the newest
 * PageSpeed run per page. Worker jobs and web pages both call this, so they
 * can never disagree about what the site looks like.
 */

import type { BusinessTerms } from "@seo-maker/core/competitors";
import { pageKeyOf } from "@seo-maker/core/crawl";
import { type SiteIntelligence, buildSiteIntelligence } from "@seo-maker/core/site";
import { Prisma, prisma } from "@seo-maker/db";
import type { Plan } from "../config";

export type LoadedSite = {
  intel: SiteIntelligence;
  projectId: string;
  projectName: string;
  crawlId: string;
  crawlStartedAt: Date;
  mode: "quick" | "deep";
  /** Business context as prompts receive it. Null in Quick mode. */
  business: Record<string, unknown> | null;
  /** Business words for relevance scoring. Null in Quick mode. */
  businessTerms: BusinessTerms | null;
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

type PerfRow = {
  pageKey: string;
  strategy: string;
  performance: number | null;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  inp: number | null;
  opportunities: unknown;
  createdAt: Date;
};

/**
 * Null when the project has no complete crawl yet: there is no site to reason
 * about, and a half-finished crawl must never feed a site-level answer.
 */
export async function loadSiteIntelligence(projectId: string): Promise<LoadedSite | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.latestCrawlId) return null;
  const crawl = await prisma.crawl.findUnique({ where: { id: project.latestCrawlId } });
  if (!crawl) return null;

  const pages = await prisma.page.findMany({
    where: { crawlId: crawl.id },
    select: {
      id: true,
      url: true,
      finalUrl: true,
      status: true,
      statusCode: true,
      pageType: true,
      searchIntent: true,
      title: true,
      metaDesc: true,
      h1: true,
      wordCount: true,
      internalLinks: true,
      canonicalUrl: true,
      indexable: true,
      inSitemap: true,
      robotsDisallowed: true,
      depth: true,
      discoveredVia: true,
      contentHash: true,
      evidence: true,
      issues: { select: { checkId: true, status: true, severity: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const keys = [...new Set(pages.map((page) => pageKeyOf(page.finalUrl ?? page.url)))];
  // Newest run per page and device, straight off the (projectId, pageKey,
  // strategy, createdAt) index, rather than every run ever stored.
  const performance = keys.length
    ? await prisma.$queryRaw<PerfRow[]>`
        SELECT DISTINCT ON ("pageKey", "strategy")
          "pageKey", "strategy", "performance", "lcp", "cls", "tbt", "inp", "opportunities", "createdAt"
        FROM "PerformanceAudit"
        WHERE "projectId" = ${projectId} AND "pageKey" IN (${Prisma.join(keys)})
        ORDER BY "pageKey", "strategy", "createdAt" DESC`
    : [];

  const deep = project.analysisMode === "deep";
  const offerings = strings(project.servicesProducts);
  const targetKeywords = strings(project.targetKeywords);
  const hasBusiness = Boolean(
    project.businessName || project.businessType || project.industry || project.businessDescription || offerings.length,
  );

  const intel = buildSiteIntelligence({
    rootUrl: project.rootUrl,
    pages,
    performance,
    crawl: {
      discovered: crawl.discovered,
      analyzed: crawl.analyzed,
      maxPages: crawl.maxPages,
      robotsAudit: crawl.robotsAudit,
      sitemapAudit: crawl.sitemapAudit,
    },
    // Quick mode works from the URL alone (Phase 0.6): no business facts are
    // used, and none are guessed in their place.
    business: deep ? { offerings, targetKeywords } : null,
  });

  return {
    intel,
    projectId: project.id,
    projectName: project.name,
    crawlId: crawl.id,
    crawlStartedAt: crawl.startedAt,
    mode: deep ? "deep" : "quick",
    business:
      deep && hasBusiness
        ? {
            siteName: project.name,
            name: project.businessName,
            type: project.businessType,
            industry: project.industry,
            description: project.businessDescription,
            targetAudience: project.targetAudience,
            targetLocation: project.targetLocation,
            servicesProducts: offerings,
            primaryGoal: project.primaryGoal,
            targetKeywords,
          }
        : null,
    businessTerms: deep
      ? {
          offerings,
          targetKeywords,
          description: project.businessDescription,
          audience: project.targetAudience,
          industry: project.industry,
        }
      : null,
  };
}

/**
 * The project owner's plan, for model routing (Phase 4.6).
 *
 * Jobs carry a project id, not a plan, and the plan can change while a job
 * waits, so it is read when the job runs.
 */
export async function planForProject(projectId: string): Promise<Plan | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) return null;
  const account = await prisma.account.findUnique({ where: { userId: project.userId }, select: { plan: true } });
  const plan = account?.plan;
  return plan === "pro" || plan === "agency" ? plan : "free";
}
