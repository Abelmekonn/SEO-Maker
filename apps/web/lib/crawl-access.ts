import { NextResponse } from "next/server";
import { crawlsPerSite } from "@seo-maker/core/plan";
import { type CrawlAllowance, getCrawlAllowance, prisma, reserveCrawl, settleUsage } from "@seo-maker/db";
import type { PlanId, PlanLimits } from "@/lib/plan";

/**
 * Crawl allowances, enforced on the server.
 *
 * Free crawls each site once, plus one re-crawl. The count lives in the usage
 * ledger by user and site, not on the project, so deleting a site and adding
 * it again does not buy more crawls. The worker settles each crawl: one that
 * produced no results (the site was down, the user stopped a re-crawl) is
 * given back.
 */

export type CrawlAccount = { plan: PlanId; limits: PlanLimits };

export async function siteCrawlAllowance(userId: string, siteKey: string | null, limits: PlanLimits): Promise<CrawlAllowance> {
  const limit = crawlsPerSite(limits);
  if (!siteKey) return { used: 0, limit, remaining: limit };
  return getCrawlAllowance(prisma, userId, siteKey, limit);
}

export type CrawlReservation = { ok: true; usageId: string } | { ok: false; response: NextResponse };

export async function reserveSiteCrawl(input: {
  userId: string;
  account: CrawlAccount;
  siteKey: string;
  projectId: string;
  /** page: one page crawled again, which counts as a re-crawl where re-crawls are limited. */
  scope: "initial" | "recrawl" | "page";
}): Promise<CrawlReservation> {
  const limit = crawlsPerSite(input.account.limits);
  const reserved = await reserveCrawl(prisma, {
    userId: input.userId,
    siteKey: input.siteKey,
    projectId: input.projectId,
    scope: input.scope,
    limit,
  });
  if (reserved.ok) return { ok: true, usageId: reserved.id };

  const recrawls = input.account.limits.recrawlsPerSite ?? 0;
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          input.scope === "initial"
            ? `You have already used ${input.account.limits.label}'s crawls of this site (the first crawl and ${recrawls} re-crawl). Upgrade to crawl it again.`
            : `${input.account.limits.label} includes ${recrawls} re-crawl of each site, and it has been used. Upgrade to re-crawl as often as you need.`,
        upgrade: input.account.plan === "free",
        code: "recrawl-limit",
        allowance: reserved.allowance,
      },
      { status: 402 },
    ),
  };
}

/** Gives back crawls and generations that were never run: a queued job removed. */
export async function refundUsage(usageIds: string[], reason: string, status: "refunded" | "cancelled" = "refunded") {
  await Promise.all(usageIds.map((id) => settleUsage(prisma, id, status, reason).catch(() => undefined)));
}
