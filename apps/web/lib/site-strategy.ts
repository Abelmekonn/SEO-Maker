import { type SiteStrategy, siteStrategySchema } from "@seo-maker/ai/schemas";
import { prisma } from "@seo-maker/db";
import { friendlyAiError } from "@/lib/ai-results";

/**
 * The latest Site Strategy for a project.
 *
 * Re-validated on the way out like every stored AI result: a row that no
 * longer fits the contract reads as "no usable result", never as raw model
 * output. A failed run is returned too, so the screen can say what went wrong.
 */
export type SiteStrategyView = {
  id: string;
  createdAt: string;
  crawlId: string | null;
  status: "ok" | "failed";
  data: SiteStrategy | null;
  /** In words a user can act on; null when it worked. */
  error: string | null;
  knowledgeVersion: string | null;
  mode: string;
};

export async function getSiteStrategy(projectId: string): Promise<SiteStrategyView | null> {
  const row = await prisma.aiResult.findFirst({
    where: { projectId, feature: "site-strategy" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, status: true, output: true, error: true, knowledgeVersion: true, mode: true },
  });
  if (!row) return null;
  const parsed = row.status === "ok" ? siteStrategySchema.safeParse(row.output) : null;
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    crawlId: null,
    status: parsed?.success ? "ok" : "failed",
    data: parsed?.success ? parsed.data : null,
    error: parsed?.success ? null : friendlyAiError(row.error),
    knowledgeVersion: row.knowledgeVersion,
    mode: row.mode,
  };
}
