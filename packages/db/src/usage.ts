import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * The usage ledger: plan allowances, enforced on the server.
 *
 * Two allowances are counted here, both from `UsageRecord` rows:
 *
 *  - AI generations per user over a rolling 24 hours and 7 days.
 *  - Crawls per site (the first crawl plus the plan's re-crawls).
 *
 * A request reserves a unit before its job is queued, inside a per-user
 * Postgres advisory lock, so two concurrent requests cannot both take the
 * last unit. The worker settles the record when the job ends. Only
 * `succeeded` records, and `reserved` ones young enough to still be running,
 * count: a generation that failed, was stopped, or produced nothing new is
 * not charged.
 */

type Db = PrismaClient | Prisma.TransactionClient;

const HOUR = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR;
export const WEEK_MS = 7 * DAY_MS;

/**
 * How long an unsettled AI reservation keeps counting. Longer than any job
 * waits and runs; after it, the job is presumed lost (a worker restart, a
 * flushed queue) and the unit is given back.
 */
export const AI_RESERVATION_TTL_MS = 2 * HOUR;

/** The same for crawls, which can queue behind other users' crawls for a while. */
export const CRAWL_RESERVATION_TTL_MS = 6 * HOUR;

export type UsageStatus = "reserved" | "succeeded" | "failed" | "cancelled" | "refunded";

export type UsageWindow = {
  used: number;
  /** Null when the plan has no cap. */
  limit: number | null;
  remaining: number | null;
  /** When the next unit frees up, if the window is full. */
  resetsAt: Date | null;
};

export type AiQuota = {
  daily: UsageWindow;
  weekly: UsageWindow;
  /** Which window is full, if any. The weekly one wins when both are. */
  exhausted: "daily" | "weekly" | null;
};

export type AiLimits = { daily: number | null; weekly: number | null };

/**
 * One rolling window over counted records.
 *
 * `times` are the counted records' creation times, oldest first. When the
 * window is full, the next unit frees when enough of the oldest ones age out
 * to bring usage under the limit, which is also right after a downgrade that
 * left usage above the new limit.
 */
export function rollingWindow(times: Date[], windowMs: number, limit: number | null, now: Date): UsageWindow {
  const inWindow = times.filter((time) => time.getTime() > now.getTime() - windowMs);
  const used = inWindow.length;
  if (limit == null) {
    return { used, limit: null, remaining: null, resetsAt: null };
  }
  const remaining = Math.max(0, limit - used);
  const resetsAt = used >= limit ? new Date(inWindow[used - limit].getTime() + windowMs) : null;
  return { used, limit, remaining, resetsAt };
}

export function quotaFrom(times: Date[], limits: AiLimits, now: Date): AiQuota {
  const daily = rollingWindow(times, DAY_MS, limits.daily, now);
  const weekly = rollingWindow(times, WEEK_MS, limits.weekly, now);
  const exhausted = weekly.remaining === 0 ? "weekly" : daily.remaining === 0 ? "daily" : null;
  return { daily, weekly, exhausted };
}

/** Creation times of the user's AI records that count, oldest first. */
async function countedAiTimes(db: Db, userId: string, now: Date): Promise<Date[]> {
  const rows = await db.usageRecord.findMany({
    where: {
      userId,
      kind: "ai",
      createdAt: { gt: new Date(now.getTime() - WEEK_MS) },
      OR: [
        { status: "succeeded" },
        { status: "reserved", createdAt: { gt: new Date(now.getTime() - AI_RESERVATION_TTL_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return rows.map((row) => row.createdAt);
}

export async function getAiQuota(db: Db, userId: string, limits: AiLimits, now = new Date()): Promise<AiQuota> {
  return quotaFrom(await countedAiTimes(db, userId, now), limits, now);
}

/** Serialises allowance checks per user and allowance, for the rest of the transaction. */
async function lockFor(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export type ReserveAiInput = {
  userId: string;
  scope: "page" | "site" | "competitor";
  projectId: string;
  siteKey?: string | null;
  pageKey?: string | null;
  features?: string[] | null;
  /** Idempotency key from the client. */
  requestKey?: string | null;
  limits: AiLimits;
};

export type ReserveAiResult =
  | { ok: true; id: string; replayed: boolean; quota: AiQuota }
  | { ok: false; reason: "daily" | "weekly"; quota: AiQuota };

/**
 * Takes one AI generation from the user's allowance, or says why not.
 *
 * A retried request with the same `requestKey` returns the record it already
 * made instead of taking a second unit.
 */
export async function reserveAiGeneration(db: PrismaClient, input: ReserveAiInput): Promise<ReserveAiResult> {
  return db.$transaction(async (tx) => {
    await lockFor(tx, `usage:ai:${input.userId}`);
    const now = new Date();

    if (input.requestKey) {
      const existing = await tx.usageRecord.findUnique({
        where: { userId_requestKey: { userId: input.userId, requestKey: input.requestKey } },
        select: { id: true },
      });
      if (existing) {
        return { ok: true as const, id: existing.id, replayed: true, quota: await getAiQuota(tx, input.userId, input.limits, now) };
      }
    }

    const times = await countedAiTimes(tx, input.userId, now);
    const before = quotaFrom(times, input.limits, now);
    if (before.exhausted) {
      return { ok: false as const, reason: before.exhausted, quota: before };
    }

    const row = await tx.usageRecord.create({
      data: {
        userId: input.userId,
        kind: "ai",
        scope: input.scope,
        projectId: input.projectId,
        siteKey: input.siteKey ?? null,
        pageKey: input.pageKey ?? null,
        features: input.features ? (input.features as Prisma.InputJsonValue) : undefined,
        requestKey: input.requestKey ?? null,
        createdAt: now,
      },
      select: { id: true },
    });
    return { ok: true as const, id: row.id, replayed: false, quota: quotaFrom([...times, now], input.limits, now) };
  });
}

/**
 * Closes a reservation. Only a `reserved` record changes, so settling twice
 * (a job retried, a refund after a failure already recorded) is harmless.
 */
export async function settleUsage(db: Db, id: string, status: Exclude<UsageStatus, "reserved">, error?: string | null) {
  await db.usageRecord.updateMany({
    where: { id, status: "reserved" },
    data: { status, error: error ? error.slice(0, 500) : null, settledAt: new Date() },
  });
}

export type CrawlAllowance = {
  used: number;
  /** Crawls the site may have in total, first crawl included. Null when unlimited. */
  limit: number | null;
  remaining: number | null;
};

async function countedCrawls(db: Db, userId: string, siteKey: string, now: Date): Promise<number> {
  return db.usageRecord.count({
    where: {
      userId,
      kind: "crawl",
      siteKey,
      // A single page crawled again ("Crawl page") is a crawl of the site too:
      // on a plan with one page, it is the whole site.
      scope: { in: ["initial", "recrawl", "page"] },
      OR: [
        { status: "succeeded" },
        { status: "reserved", createdAt: { gt: new Date(now.getTime() - CRAWL_RESERVATION_TTL_MS) } },
      ],
    },
  });
}

export async function getCrawlAllowance(
  db: Db,
  userId: string,
  siteKey: string,
  limit: number | null,
): Promise<CrawlAllowance> {
  const used = await countedCrawls(db, userId, siteKey, new Date());
  return { used, limit, remaining: limit == null ? null : Math.max(0, limit - used) };
}

export type ReserveCrawlResult =
  | { ok: true; id: string; allowance: CrawlAllowance }
  | { ok: false; allowance: CrawlAllowance };

/** Takes one crawl of a site from the user's allowance, or says why not. */
export async function reserveCrawl(
  db: PrismaClient,
  input: { userId: string; siteKey: string; projectId: string; scope: "initial" | "recrawl" | "page"; limit: number | null },
): Promise<ReserveCrawlResult> {
  return db.$transaction(async (tx) => {
    await lockFor(tx, `usage:crawl:${input.userId}:${input.siteKey}`);
    const now = new Date();
    const used = await countedCrawls(tx, input.userId, input.siteKey, now);
    if (input.limit != null && used >= input.limit) {
      return { ok: false as const, allowance: { used, limit: input.limit, remaining: 0 } };
    }
    const row = await tx.usageRecord.create({
      data: {
        userId: input.userId,
        kind: "crawl",
        scope: input.scope,
        siteKey: input.siteKey,
        projectId: input.projectId,
        createdAt: now,
      },
      select: { id: true },
    });
    const after = used + 1;
    return {
      ok: true as const,
      id: row.id,
      allowance: { used: after, limit: input.limit, remaining: input.limit == null ? null : Math.max(0, input.limit - after) },
    };
  });
}

/**
 * Gives back reservations whose job never reported back. They already stop
 * counting after their TTL; this records why, for support.
 */
export async function expireStaleReservations(db: Db, now = new Date()): Promise<number> {
  const [ai, crawl] = await Promise.all([
    db.usageRecord.updateMany({
      where: { kind: "ai", status: "reserved", createdAt: { lte: new Date(now.getTime() - AI_RESERVATION_TTL_MS) } },
      data: { status: "failed", error: "expired: the job never reported back", settledAt: now },
    }),
    db.usageRecord.updateMany({
      where: { kind: "crawl", status: "reserved", createdAt: { lte: new Date(now.getTime() - CRAWL_RESERVATION_TTL_MS) } },
      data: { status: "failed", error: "expired: the crawl never reported back", settledAt: now },
    }),
  ]);
  return ai.count + crawl.count;
}
