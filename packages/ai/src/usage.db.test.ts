import { randomUUID } from "node:crypto";
import { crawlsPerSite, planLimits } from "@seo-maker/core/plan";
import {
  getAiQuota,
  getCrawlAllowance,
  prisma,
  reserveAiGeneration,
  reserveCrawl,
  settleUsage,
} from "@seo-maker/db";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The usage ledger against a real database: concurrency, refunds and
 * idempotency. Needs Postgres (pnpm db:up), so it runs only when asked:
 *
 *   SEO_MAKER_DB_TESTS=1 pnpm --filter @seo-maker/ai test
 */

const enabled = process.env.SEO_MAKER_DB_TESTS === "1";
const FREE = { daily: planLimits.free.aiDailyLimit, weekly: planLimits.free.aiWeeklyLimit };
const users: string[] = [];

function user() {
  const id = `test_usage_${randomUUID()}`;
  users.push(id);
  return id;
}

afterAll(async () => {
  if (!enabled) return;
  await prisma.usageRecord.deleteMany({ where: { userId: { in: users } } });
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("AI generation allowance (database)", () => {
  it("gives a Free user exactly two generations when ten requests race", async () => {
    const userId = user();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        reserveAiGeneration(prisma, { userId, scope: "page", projectId: "p", limits: FREE }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.filter((result) => !result.ok && result.reason === "daily")).toHaveLength(8);
  });

  it("does not charge a failed or cancelled generation", async () => {
    const userId = user();
    const first = await reserveAiGeneration(prisma, { userId, scope: "page", projectId: "p", limits: FREE });
    const second = await reserveAiGeneration(prisma, { userId, scope: "page", projectId: "p", limits: FREE });
    if (!first.ok || !second.ok) throw new Error("expected two reservations");
    await settleUsage(prisma, first.id, "failed", "provider-error");
    await settleUsage(prisma, second.id, "cancelled");

    const quota = await getAiQuota(prisma, userId, FREE);
    expect(quota.daily.used).toBe(0);
    expect(quota.daily.remaining).toBe(2);
  });

  it("keeps a succeeded generation counted when it is settled twice", async () => {
    const userId = user();
    const reserved = await reserveAiGeneration(prisma, { userId, scope: "page", projectId: "p", limits: FREE });
    if (!reserved.ok) throw new Error("expected a reservation");
    await settleUsage(prisma, reserved.id, "succeeded");
    await settleUsage(prisma, reserved.id, "refunded");
    const row = await prisma.usageRecord.findUnique({ where: { id: reserved.id } });
    expect(row?.status).toBe("succeeded");
    expect((await getAiQuota(prisma, userId, FREE)).daily.used).toBe(1);
  });

  it("returns the same record for a retried request instead of charging twice", async () => {
    const userId = user();
    const requestKey = randomUUID();
    const first = await reserveAiGeneration(prisma, { userId, scope: "page", projectId: "p", requestKey, limits: FREE });
    const retry = await reserveAiGeneration(prisma, { userId, scope: "page", projectId: "p", requestKey, limits: FREE });
    if (!first.ok || !retry.ok) throw new Error("expected reservations");
    expect(retry.id).toBe(first.id);
    expect(retry.replayed).toBe(true);
    expect((await getAiQuota(prisma, userId, FREE)).daily.used).toBe(1);
  });

  it("puts no per-user cap on a paid plan", async () => {
    const userId = user();
    const paid = { daily: planLimits.pro.aiDailyLimit, weekly: planLimits.pro.aiWeeklyLimit };
    for (let index = 0; index < 5; index += 1) {
      const result = await reserveAiGeneration(prisma, { userId, scope: "site", projectId: "p", limits: paid });
      expect(result.ok).toBe(true);
    }
  });
});

describe.skipIf(!enabled)("crawl allowance (database)", () => {
  const limit = crawlsPerSite(planLimits.free);

  it("allows Free the first crawl and one re-crawl of a site, then stops", async () => {
    const userId = user();
    const siteKey = `${randomUUID()}.example`;
    const initial = await reserveCrawl(prisma, { userId, siteKey, projectId: "p", scope: "initial", limit });
    const recrawl = await reserveCrawl(prisma, { userId, siteKey, projectId: "p", scope: "recrawl", limit });
    const third = await reserveCrawl(prisma, { userId, siteKey, projectId: "p", scope: "recrawl", limit });
    expect(initial.ok).toBe(true);
    expect(recrawl.ok).toBe(true);
    expect(third.ok).toBe(false);
    expect(third.allowance.remaining).toBe(0);
  });

  it("counts per site, and keeps counting after the project is gone", async () => {
    const userId = user();
    const siteKey = `${randomUUID()}.example`;
    await reserveCrawl(prisma, { userId, siteKey, projectId: "deleted-project", scope: "initial", limit });
    // A new project for the same site: the ledger is not tied to the project.
    const allowance = await getCrawlAllowance(prisma, userId, siteKey, limit);
    expect(allowance.used).toBe(1);
    expect(allowance.remaining).toBe(1);
    const other = await getCrawlAllowance(prisma, userId, `${randomUUID()}.example`, limit);
    expect(other.used).toBe(0);
  });

  it("refunds a crawl that produced nothing", async () => {
    const userId = user();
    const siteKey = `${randomUUID()}.example`;
    const first = await reserveCrawl(prisma, { userId, siteKey, projectId: "p", scope: "initial", limit });
    if (!first.ok) throw new Error("expected a reservation");
    await settleUsage(prisma, first.id, "refunded", "site unreachable");
    expect((await getCrawlAllowance(prisma, userId, siteKey, limit)).used).toBe(0);
  });

  it("serialises racing re-crawls of one site", async () => {
    const userId = user();
    const siteKey = `${randomUUID()}.example`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => reserveCrawl(prisma, { userId, siteKey, projectId: "p", scope: "recrawl", limit })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(2);
  });
});
