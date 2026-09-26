import { isPlanId, planLimits } from "@seo-maker/core/plan";
import { prisma } from "@seo-maker/db";

// The plan table is shared with the worker, which enforces it when a crawl
// runs; see @seo-maker/core/plan.
export { isPlanId, planLimits, type PlanId, type PlanLimits } from "@seo-maker/core/plan";

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
