import { prisma } from "@seo-maker/db";
import type { PageRecommendation } from "@seo-maker/ai/schemas";
import { FEATURE_SCHEMAS, pageRecommendationSchema } from "@seo-maker/ai/schemas";

/**
 * Reading the AI layer's output (Phase 1).
 *
 * Stored output is re-validated on the way out, not trusted. A contract can
 * tighten between the run that produced a row and the render that reads it,
 * and a row written under the old shape must not crash the page — it degrades
 * to "no usable result" instead.
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

/** The most recent page-recommendation result for one page, if any. */
export async function getPageRecommendation(pageId: string): Promise<PageAiResult | null> {
  const row = await prisma.aiResult.findFirst({
    where: { pageId, feature: "page-recommendation" },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return row ? toResult(row as Row) : null;
}

/**
 * Latest page-recommendation per page for a project, keyed by pageId.
 *
 * One query rather than N: the suggestions list renders every page in the
 * crawl, and a per-page lookup there would be a round trip per row.
 */
export async function getProjectRecommendations(
  projectId: string,
  pageIds: string[],
): Promise<Map<string, PageAiResult>> {
  if (pageIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.aiResult.findMany({
    where: { projectId, feature: "page-recommendation", pageId: { in: pageIds } },
    orderBy: { createdAt: "desc" },
    select: { ...SELECT, pageId: true },
  });

  const byPage = new Map<string, PageAiResult>();
  for (const row of rows as (Row & { pageId: string | null })[]) {
    // Rows come newest first, so the first one seen per page is the current one.
    if (row.pageId && !byPage.has(row.pageId)) {
      byPage.set(row.pageId, toResult(row));
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
  estimatedCost: number | null;
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
export async function getPageFeatureResults(pageId: string): Promise<Map<string, FeatureResult>> {
  const rows = await prisma.aiResult.findMany({
    where: { pageId, feature: { not: "page-recommendation" } },
    orderBy: { createdAt: "desc" },
    select: { ...SELECT, estimatedCost: true },
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
      estimatedCost: row.estimatedCost,
      data: parsed?.success ? parsed.data : null,
    });
  }
  return byFeature;
}

/**
 * Whether an AI provider is configured.
 *
 * Read on the server so the UI can explain that AI is switched off rather than
 * offering a button that always fails. Mirrors `loadAiConfig().enabled`, but
 * reads the variable directly to avoid pulling provider code into the bundle.
 */
export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}
