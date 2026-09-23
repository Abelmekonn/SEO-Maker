import { prisma } from "@seo-maker/db";

export type PlanId = "free" | "pro" | "agency";

export type PlanLimits = {
  label: string;
  maxProjects: number;
  maxPages: number;
  maxCompetitors: number;
  /**
   * Whether AI analysis is available.
   *
   * Free finds problems; it does not explain or fix them. The deterministic
   * crawl, the checks and the findings all stay available, because a plan that
   * hides the problem has nothing to upgrade for.
   */
  ai: boolean;
  /** Deep mode collects business context to make recommendations specific. */
  deepMode: boolean;
};

export const planLimits: Record<PlanId, PlanLimits> = {
  free: {
    label: "Free",
    maxProjects: 1,
    maxPages: 1,
    maxCompetitors: 0,
    ai: false,
    deepMode: false,
  },
  pro: { label: "Pro", maxProjects: 1, maxPages: 10, maxCompetitors: 5, ai: true, deepMode: true },
  agency: {
    label: "Agency",
    maxProjects: 100,
    maxPages: 100,
    maxCompetitors: 25,
    ai: true,
    deepMode: true,
  },
};

export function isPlanId(value: string): value is PlanId {
  return value === "free" || value === "pro" || value === "agency";
}

type AccountRow = {
  userId: string;
  email: string;
  plan: string;
  source: string;
};

export async function getAccountForUser(userId: string) {
  const rows = await prisma.$queryRaw<AccountRow[]>`
    SELECT "userId", email, plan, source
    FROM "Account"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;
  const account = rows[0];
  const plan = account && isPlanId(account.plan) ? account.plan : "free";
  return {
    userId,
    email: account?.email ?? null,
    plan,
    source: account?.source ?? "signup",
    limits: planLimits[plan],
  };
}
