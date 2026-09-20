import { prisma } from "@seo-maker/db";

export type PlanId = "free" | "pro" | "agency";

export const planLimits: Record<
  PlanId,
  { label: string; maxProjects: number; maxPages: number; maxCompetitors: number }
> = {
  free: { label: "Free", maxProjects: 1, maxPages: 1, maxCompetitors: 0 },
  pro: { label: "Pro", maxProjects: 1, maxPages: 10, maxCompetitors: 5 },
  agency: { label: "Agency", maxProjects: 100, maxPages: 100, maxCompetitors: 25 },
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
