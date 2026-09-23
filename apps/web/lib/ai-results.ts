import { prisma } from "@seo-maker/db";
import type { PageRecommendation } from "@seo-maker/ai/schemas";
import { pageRecommendationSchema } from "@seo-maker/ai/schemas";

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
