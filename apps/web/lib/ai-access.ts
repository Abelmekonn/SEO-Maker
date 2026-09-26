import { NextResponse } from "next/server";
import { loadAiConfig } from "@seo-maker/ai";
import { type AiCapability, planAllowsAi } from "@seo-maker/core/plan";
import { type AiQuota, getAiQuota, prisma, reserveAiGeneration, settleUsage } from "@seo-maker/db";
import { getAiUsage } from "@/lib/ai-usage";
import type { PlanId, PlanLimits } from "@/lib/plan";

/**
 * Server-side AI access: every AI request passes through here.
 *
 *   plan includes the capability?        402, with an upgrade path
 *   Free: is it the homepage?            402
 *   a provider configured?               503
 *   allowance left (2/day, 10/week)?     429, with when it frees up
 *   system capacity left today?          429
 *   -> reserve one generation, then queue the job with its usage id
 *
 * Nothing a client sends can skip a step: the page, plan and quota are all
 * read here, and the worker settles the reservation when the job ends.
 * Messages never mention tokens or cost; the owner pays for those.
 */

export type Account = { plan: PlanId; limits: PlanLimits };

/** Whether any AI provider has a key. */
export function aiConfigured(): boolean {
  return loadAiConfig().enabled;
}

const CAPABILITY_NAME: Record<AiCapability, string> = {
  page: "Page AI",
  site: "Site AI",
  competitor: "Competitor AI",
};

/** Upgrade prompt when a plan lacks a capability, else null. */
export function capabilityDenied(account: Account, capability: AiCapability): NextResponse | null {
  if (planAllowsAi(account.limits, capability)) return null;
  return NextResponse.json(
    {
      error:
        capability === "competitor"
          ? `Competitor AI is part of the Pro and Agency plans. ${account.limits.label} includes Page AI for your homepage.`
          : `${CAPABILITY_NAME[capability]} is part of the Pro and Agency plans. ${account.limits.label} includes Page AI for your homepage.`,
      upgrade: true,
      code: "plan",
    },
    { status: 402 },
  );
}

function pathOf(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path === "" ? "/" : path.toLowerCase();
  } catch {
    return url;
  }
}

/**
 * Whether a page is the site's homepage: the page the crawl started from, or
 * the site's root address. The start page counts even when it redirected
 * (example.com -> example.com/en/), since that is the homepage visitors get.
 */
export function isHomepage(
  page: { url: string; finalUrl: string | null; discoveredVia?: string | null },
  rootUrl: string,
): boolean {
  if (page.discoveredVia === "seed") return true;
  const root = pathOf(rootUrl);
  return [page.url, page.finalUrl].some((url) => url != null && (pathOf(url) === "/" || pathOf(url) === root));
}

/** Free's Page AI covers the homepage only. */
export function homepageDenied(
  account: Account,
  page: { url: string; finalUrl: string | null; discoveredVia?: string | null },
  rootUrl: string,
): NextResponse | null {
  if (!account.limits.aiHomepageOnly || isHomepage(page, rootUrl)) return null;
  return NextResponse.json(
    {
      error: `${account.limits.label} includes Page AI for your homepage. Upgrade to analyse every page of your site.`,
      upgrade: true,
      code: "homepage-only",
    },
    { status: 402 },
  );
}

export function notConfigured(): NextResponse {
  return NextResponse.json(
    { error: "AI is not available right now. Please try again later.", code: "not-configured" },
    { status: 503 },
  );
}

/** A quota as the client receives it: counts and reset times, never tokens. */
export type QuotaView = {
  daily: { used: number; limit: number | null; remaining: number | null; resetsAt: string | null };
  weekly: { used: number; limit: number | null; remaining: number | null; resetsAt: string | null };
  exhausted: "daily" | "weekly" | null;
};

export function quotaView(quota: AiQuota): QuotaView {
  const window = (value: AiQuota["daily"]) => ({
    used: value.used,
    limit: value.limit,
    remaining: value.remaining,
    resetsAt: value.resetsAt ? value.resetsAt.toISOString() : null,
  });
  return { daily: window(quota.daily), weekly: window(quota.weekly), exhausted: quota.exhausted };
}

export function aiLimitsOf(limits: PlanLimits) {
  return { daily: limits.aiDailyLimit, weekly: limits.aiWeeklyLimit };
}

export async function getUserQuota(userId: string, limits: PlanLimits): Promise<QuotaView> {
  return quotaView(await getAiQuota(prisma, userId, aiLimitsOf(limits)));
}

function untilText(resetsAt: Date | null): string {
  if (!resetsAt) return "soon";
  const minutes = Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in about ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `in about ${days} ${days === 1 ? "day" : "days"}`;
}

export function quotaMessage(quota: AiQuota, account: Account): string {
  if (quota.exhausted === "weekly") {
    return `You have used this week's ${quota.weekly.limit} AI generations on ${account.limits.label}. The next one frees up ${untilText(quota.weekly.resetsAt)}.`;
  }
  return `You have used today's ${quota.daily.limit} AI generations on ${account.limits.label}. The next one frees up ${untilText(quota.daily.resetsAt)}.`;
}

/**
 * The system-wide daily capacity the owner set (AI_DAILY_TOKEN_BUDGET),
 * checked after the user's own allowance. Refuses without numbers.
 */
async function capacityLeft(minimum: number): Promise<boolean> {
  const usage = await getAiUsage();
  return usage.remaining >= minimum;
}

export type Reservation =
  | { ok: true; usageId: string; replayed: boolean; quota: QuotaView }
  | { ok: false; response: NextResponse };

/**
 * Takes one generation from the user's allowance before a job is queued.
 * On a later failure to queue, call `refund` with the id.
 */
export async function reserveGeneration(input: {
  userId: string;
  account: Account;
  scope: AiCapability;
  projectId: string;
  siteKey?: string | null;
  pageKey?: string | null;
  features?: string[] | null;
  requestKey?: string | null;
  /** Roughly what the call needs, for the system capacity check. */
  capacityNeeded?: number;
}): Promise<Reservation> {
  if (!(await capacityLeft(input.capacityNeeded ?? 4_000))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AI is at capacity for today. Please try again later.", code: "capacity" },
        { status: 429 },
      ),
    };
  }

  const reserved = await reserveAiGeneration(prisma, {
    userId: input.userId,
    scope: input.scope,
    projectId: input.projectId,
    siteKey: input.siteKey ?? null,
    pageKey: input.pageKey ?? null,
    features: input.features ?? null,
    requestKey: input.requestKey ?? null,
    limits: aiLimitsOf(input.account.limits),
  });
  if (!reserved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: quotaMessage(reserved.quota, input.account),
          code: "quota",
          upgrade: input.account.plan === "free",
          quota: quotaView(reserved.quota),
        },
        { status: 429 },
      ),
    };
  }
  return { ok: true, usageId: reserved.id, replayed: reserved.replayed, quota: quotaView(reserved.quota) };
}

/** Gives a reserved generation back: the job was never queued, or had nothing to do. */
export async function refund(usageId: string, reason: string) {
  await settleUsage(prisma, usageId, "refunded", reason).catch(() => undefined);
}

/** A client idempotency key, if it sent a sensible one. */
export function requestKeyOf(request: Request, body: { requestId?: unknown } | null): string | null {
  const header = request.headers.get("idempotency-key");
  const value = typeof body?.requestId === "string" ? body.requestId : header;
  return value && /^[A-Za-z0-9_-]{8,80}$/.test(value) ? value : null;
}
