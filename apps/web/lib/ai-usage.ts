import { prisma } from "@seo-maker/db";

/**
 * AI budget and pace, sized for the provider tier in use.
 *
 * Groq's free tier limits tokens per minute and per day for each model. The
 * defaults below are for openai/gpt-oss-120b on that tier; they come from
 * Groq's published limits at the time of writing, so check them in the Groq
 * console and override with AI_TOKENS_PER_MINUTE and AI_DAILY_TOKEN_BUDGET
 * when the tier or model changes. Usage is measured from our own AiResult
 * rows, because the provider does not report the daily total back to us.
 */

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function aiLimits() {
  return {
    tokensPerMinute: envInt("AI_TOKENS_PER_MINUTE", 8_000),
    dailyTokenBudget: envInt("AI_DAILY_TOKEN_BUDGET", 200_000),
  };
}

/** Used when there is no history yet: one explanation plus about three fixes. */
const DEFAULT_TOKENS_PER_PAGE = 15_000;

export type AiUsage = {
  tokens24h: number;
  calls24h: number;
  failed24h: number;
  rateLimited24h: number;
  cost24h: number;
  budget: number;
  remaining: number;
  /** Average tokens one fully analysed page has cost, from recent history. */
  tokensPerPage: number;
  /** Minutes one page takes at the tier's per-minute limit, rounded up. */
  minutesPerPage: number;
  /** Pages the rest of today's budget covers. */
  pagesLeftToday: number;
};

/**
 * Usage of the configured AI key over the last 24 hours.
 *
 * Counts every project, because the provider's limits apply to the key, not
 * to a project: another project's run uses the same daily allowance.
 */
export async function getAiUsage(): Promise<AiUsage> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { tokensPerMinute, dailyTokenBudget } = aiLimits();

  const [day, failed, rateLimited, week] = await Promise.all([
    // Cache reuse is stored as a zero-token copy; it is not a provider call.
    prisma.aiResult.aggregate({
      where: { createdAt: { gte: since }, OR: [{ inputTokens: null }, { inputTokens: { not: 0 } }] },
      _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
      _count: { _all: true },
    }),
    prisma.aiResult.count({ where: { createdAt: { gte: since }, status: { not: "ok" } } }),
    prisma.aiResult.count({ where: { createdAt: { gte: since }, error: { startsWith: "rate-limited" } } }),
    prisma.aiResult.groupBy({
      by: ["pageId"],
      where: { createdAt: { gte: weekAgo }, status: "ok", pageId: { not: null }, inputTokens: { gt: 0 } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);

  const tokens24h = (day._sum.inputTokens ?? 0) + (day._sum.outputTokens ?? 0);
  const weekTokens = week.reduce((sum, row) => sum + (row._sum.inputTokens ?? 0) + (row._sum.outputTokens ?? 0), 0);
  const tokensPerPage = week.length >= 3 ? Math.round(weekTokens / week.length) : DEFAULT_TOKENS_PER_PAGE;
  const remaining = Math.max(0, dailyTokenBudget - tokens24h);

  return {
    tokens24h,
    calls24h: day._count._all,
    failed24h: failed,
    rateLimited24h: rateLimited,
    cost24h: Math.round((day._sum.estimatedCost ?? 0) * 10_000) / 10_000,
    budget: dailyTokenBudget,
    remaining,
    tokensPerPage,
    minutesPerPage: Math.max(1, Math.ceil(tokensPerPage / tokensPerMinute)),
    pagesLeftToday: Math.floor(remaining / tokensPerPage),
  };
}

export type FeatureSpend = {
  feature: string;
  /** Answers the provider generated. */
  calls: number;
  /** Answers reused from the cache: stored as zero-token copies. */
  cached: number;
  failed: number;
  tokens: number;
  cost: number;
  models: string[];
};

/**
 * AI spend per feature for one project (Phase 4.5).
 *
 * A cache hit is stored as a zero-token copy of an earlier answer, so the
 * cached share here is what caching actually saved, not an estimate. Models
 * are listed per feature because routing can send simple and complex
 * features to different ones.
 */
export async function getFeatureSpend(projectId: string, days = 7): Promise<FeatureSpend[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.aiResult.findMany({
    where: { projectId, createdAt: { gte: since } },
    select: { feature: true, status: true, model: true, inputTokens: true, outputTokens: true, estimatedCost: true },
    take: 5000,
  });
  const byFeature = new Map<string, FeatureSpend & { modelSet: Set<string> }>();
  for (const row of rows) {
    const entry =
      byFeature.get(row.feature) ??
      { feature: row.feature, calls: 0, cached: 0, failed: 0, tokens: 0, cost: 0, models: [], modelSet: new Set<string>() };
    if (row.status !== "ok") entry.failed += 1;
    else if (row.inputTokens === 0) entry.cached += 1;
    else entry.calls += 1;
    entry.tokens += (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
    entry.cost += row.estimatedCost ?? 0;
    entry.modelSet.add(row.model);
    byFeature.set(row.feature, entry);
  }
  return [...byFeature.values()]
    .map(({ modelSet, ...entry }) => ({ ...entry, cost: Math.round(entry.cost * 10_000) / 10_000, models: [...modelSet] }))
    .sort((a, b) => b.tokens - a.tokens);
}
