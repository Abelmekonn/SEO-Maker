import { prisma } from "@seo-maker/db";
import type { PageRecommendation } from "@seo-maker/ai/schemas";
import { FEATURE_SCHEMAS, pageRecommendationSchema } from "@seo-maker/ai/schemas";
import { pageKeyIndex } from "@/lib/page-results";

/**
 * Reading the AI layer's output (Phase 1).
 *
 * Stored output is re-validated on the way out, not trusted. A contract can
 * tighten between the run that produced a row and the render that reads it,
 * and a row written under the old shape must not crash the page — it degrades
 * to "no usable result" instead.
 *
 * Page results are read by page key (the page's URL), never by page id: each
 * crawl writes new page rows, and a result tied to a row id vanished at the
 * next crawl. A result older than the page row on screen was written for an
 * earlier crawl of that page (see isFromEarlierCrawl).
 */

export type PageAiResult = {
  id: string;
  status: string;
  feature: string;
  mode: string;
  model: string;
  provider: string;
  knowledgeVersion: string | null;
  error: string | null;
  createdAt: Date;
  /** Null when the row failed, or when its output no longer fits the contract. */
  data: PageRecommendation | null;
};

const SELECT = {
  id: true,
  status: true,
  feature: true,
  mode: true,
  model: true,
  provider: true,
  knowledgeVersion: true,
  error: true,
  createdAt: true,
  output: true,
} as const;

type Row = {
  id: string;
  status: string;
  feature: string;
  mode: string;
  model: string;
  provider: string;
  knowledgeVersion: string | null;
  error: string | null;
  createdAt: Date;
  output: unknown;
};

function toResult(row: Row): PageAiResult {
  const parsed =
    row.status === "ok" ? pageRecommendationSchema.safeParse(row.output) : null;

  return {
    id: row.id,
    status: row.status,
    feature: row.feature,
    mode: row.mode,
    model: row.model,
    provider: row.provider,
    knowledgeVersion: row.knowledgeVersion,
    error: row.error,
    createdAt: row.createdAt,
    data: parsed?.success ? parsed.data : null,
  };
}

/**
 * Whether a result predates the crawl on screen. The page row is written when
 * the crawl fetches it, so anything older was produced from an earlier crawl.
 */
export function isFromEarlierCrawl(result: { createdAt: Date }, page: { createdAt: Date }): boolean {
  return result.createdAt < page.createdAt;
}

/** The most recent page-recommendation result for one page, if any. */
export async function getPageRecommendation(projectId: string, pageKey: string): Promise<PageAiResult | null> {
  const row = await prisma.aiResult.findFirst({
    where: { projectId, pageKey, feature: "page-recommendation" },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return row ? toResult(row as Row) : null;
}

/**
 * Latest page-recommendation per page for a project, keyed by the id of the
 * page on screen.
 *
 * One query rather than N: the suggestions list renders every page in the
 * crawl, and a per-page lookup there would be a round trip per row.
 */
export async function getProjectRecommendations(
  projectId: string,
  pages: Array<{ id: string; url: string; finalUrl: string | null }>,
): Promise<Map<string, PageAiResult>> {
  if (pages.length === 0) {
    return new Map();
  }
  const { idByKey } = pageKeyIndex(pages);

  const rows = await prisma.aiResult.findMany({
    where: { projectId, feature: "page-recommendation", pageKey: { in: [...idByKey.keys()] } },
    orderBy: { createdAt: "desc" },
    select: { ...SELECT, pageKey: true },
  });

  const byPage = new Map<string, PageAiResult>();
  for (const row of rows as (Row & { pageKey: string | null })[]) {
    const pageId = row.pageKey ? idByKey.get(row.pageKey) : undefined;
    // Rows come newest first, so the first one seen per page is the current one.
    if (pageId && !byPage.has(pageId)) {
      byPage.set(pageId, toResult(row));
    }
  }
  return byPage;
}

/** The latest result of one generation feature (title, meta, schema...) for a page. */
export type FeatureResult = {
  id: string;
  feature: string;
  status: string;
  mode: string;
  model: string;
  provider: string;
  knowledgeVersion: string | null;
  error: string | null;
  createdAt: Date;
  /** Re-validated against the feature's contract; null when failed or no longer valid. */
  data: unknown;
};

/**
 * Latest result per generation feature for one page (Phase 2.6).
 *
 * Same rule as page recommendations: stored output is re-validated against the
 * current contract, and a row that no longer fits degrades to "no result"
 * rather than rendering unchecked data.
 */
export async function getPageFeatureResults(projectId: string, pageKey: string): Promise<Map<string, FeatureResult>> {
  const rows = await prisma.aiResult.findMany({
    where: { projectId, pageKey, feature: { not: "page-recommendation" } },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });

  const byFeature = new Map<string, FeatureResult>();
  for (const row of rows) {
    if (byFeature.has(row.feature)) continue;
    const schema = FEATURE_SCHEMAS[row.feature as keyof typeof FEATURE_SCHEMAS];
    const parsed = row.status === "ok" && schema ? schema.safeParse(row.output) : null;
    byFeature.set(row.feature, {
      id: row.id,
      feature: row.feature,
      status: row.status,
      mode: row.mode,
      model: row.model,
      provider: row.provider,
      knowledgeVersion: row.knowledgeVersion,
      error: row.error,
      createdAt: row.createdAt,
      data: parsed?.success ? parsed.data : null,
    });
  }
  return byFeature;
}

/** Whether any AI provider is configured. */
export { aiConfigured } from "@/lib/ai-access";

/**
 * A stored AI error in words a user can act on.
 *
 * AiResult.error holds "kind | message | provider body" for debugging. The
 * provider body is JSON and the kinds are internal, so the UI shows this
 * instead, and keeps the raw text behind a disclosure for support.
 */
export function friendlyAiError(error: string | null): string {
  const text = error ?? "";
  const kind = text.split("|")[0]?.trim();
  if (kind === "rate-limited") {
    return /per day|TPD|RPD|PerDay/i.test(text)
      ? "The AI service reached its daily limit. Try again tomorrow."
      : "The AI service was busy. Try again in a minute.";
  }
  if (kind === "invalid-output") {
    return /grounding check/i.test(text)
      ? "The answer failed a grounding check (it referred to something the crawl did not find), so it was not stored."
      : "The answer did not match the expected format and was not stored. Try again.";
  }
  if (kind === "timeout") return "The AI service took too long to answer. Try again.";
  if (kind === "auth" || kind === "not-configured" || kind === "unavailable") {
    return "AI is temporarily unavailable. Try again later.";
  }
  return "The AI request did not finish. Try again.";
}
