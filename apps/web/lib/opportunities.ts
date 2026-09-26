import { syncSiteOpportunities } from "@seo-maker/ai";
import { siteOpportunitySchema } from "@seo-maker/ai/schemas";
import { type OpportunityOutcome, opportunityOutcome } from "@seo-maker/core/crawl";
import { OPPORTUNITY_PART_LABELS } from "@seo-maker/core/scoring";
import { PRIORITY_PART_LABELS } from "@seo-maker/core/site";
import { prisma } from "@seo-maker/db";
import { pageKeyIndex } from "@/lib/page-results";

/**
 * Site opportunities as the dashboard reads them (Phase 3.8).
 *
 * Every number shown traces to a stored Opportunity row, which traces to the
 * crawl it was derived from. Scores and bands are the deterministic engine's;
 * wording is the AI's only when `aiUsed`, and is labelled so.
 */

export const OPPORTUNITY_STATUSES = ["open", "in-progress", "done", "dismissed"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export function isOpportunityStatus(value: unknown): value is OpportunityStatus {
  return typeof value === "string" && (OPPORTUNITY_STATUSES as readonly string[]).includes(value);
}

export const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical",
  onpage: "On-page",
  content: "Content",
  "internal-links": "Internal links",
  "structured-data": "Structured data",
  performance: "Performance",
};

export type OpportunityView = {
  id: string;
  key: string;
  source: "site" | "competitor";
  category: string;
  title: string;
  rationale: string | null;
  action: string | null;
  nextStep: string | null;
  score: number;
  band: string;
  effort: string | null;
  confidence: number | null;
  facts: string[];
  /** The AI's one-sentence restatement of the facts, when it has run. */
  statement: string | null;
  affected: Array<{ key: string; url: string; path: string; pageId: string | null }>;
  affectedCount: number;
  baselineCount: number | null;
  outcome: OpportunityOutcome;
  status: OpportunityStatus;
  aiUsed: boolean;
  resolvedAt: Date | null;
  updatedAt: Date;
  competitor: { id: string; domain: string } | null;
  /** The priority's parts, largest first, so a score can be explained. */
  parts: Array<{ label: string; points: number }>;
};

function readEvidence(value: unknown): { facts: string[]; statement: string | null } {
  const raw = (value && typeof value === "object" ? value : {}) as { facts?: unknown; statement?: unknown };
  return {
    facts: Array.isArray(raw.facts) ? raw.facts.filter((fact): fact is string => typeof fact === "string") : [],
    statement: typeof raw.statement === "string" ? raw.statement : null,
  };
}

function readAffected(value: unknown): Array<{ key: string; url: string; path: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = item as { key?: unknown; url?: unknown; path?: unknown };
    return typeof row?.key === "string" && typeof row.url === "string"
      ? [{ key: row.key, url: row.url, path: typeof row.path === "string" ? row.path : row.url }]
      : [];
  });
}

function readParts(value: unknown, source: string): Array<{ label: string; points: number }> {
  const parts = (value as { parts?: Record<string, { points?: number; weight?: number }> } | null)?.parts;
  if (!parts || typeof parts !== "object") return [];
  const labels: Record<string, string> = source === "competitor" ? OPPORTUNITY_PART_LABELS : PRIORITY_PART_LABELS;
  return Object.entries(parts)
    .filter(([, part]) => (part?.weight ?? 0) > 0)
    .map(([id, part]) => ({ label: labels[id] ?? id, points: Math.round((part?.points ?? 0) * 10) / 10 }))
    .sort((a, b) => b.points - a.points);
}

/**
 * Makes sure the stored site opportunities describe the latest crawl.
 *
 * The crawl worker re-derives them after every crawl. This covers a crawl that
 * finished before this feature existed, or a worker that could not: deriving
 * is deterministic and takes well under a second, so the page never shows
 * opportunities from an older crawl than the one on screen.
 */
export async function ensureSiteOpportunities(project: { id: string; latestCrawlId: string | null }): Promise<void> {
  if (!project.latestCrawlId) return;
  const current = await prisma.opportunity.findFirst({
    where: { projectId: project.id, source: "site", crawlId: project.latestCrawlId },
    select: { id: true },
  });
  if (current) return;
  try {
    await syncSiteOpportunities(project.id);
  } catch (error) {
    console.error("Could not derive site opportunities", error);
  }
}

export async function getOpportunities(
  project: { id: string; latestCrawlId: string | null },
  pages: Array<{ id: string; url: string; finalUrl: string | null }>,
): Promise<OpportunityView[]> {
  const { idByKey } = pageKeyIndex(pages);
  const rows = await prisma.opportunity.findMany({
    where: { projectId: project.id },
    orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
    include: { competitor: { select: { id: true, domain: true } } },
    take: 200,
  });

  return rows.map((row) => {
    const evidence = readEvidence(row.evidence);
    return {
      id: row.id,
      key: row.key ?? row.id,
      source: row.source === "competitor" ? "competitor" : "site",
      category: row.category,
      title: row.title,
      rationale: row.rationale,
      action: row.action,
      nextStep: row.nextStep,
      score: row.score,
      band: row.band,
      effort: row.effort,
      confidence: row.confidence,
      facts: evidence.facts,
      statement: evidence.statement,
      affected: readAffected(row.affectedUrls).map((page) => ({ ...page, pageId: idByKey.get(page.key) ?? null })),
      affectedCount: row.affectedCount,
      baselineCount: row.baselineCount,
      outcome: opportunityOutcome({
        baselineCount: row.baselineCount,
        affectedCount: row.affectedCount,
        resolvedAt: row.resolvedAt,
        firstSeenInLatestCrawl: row.baselineCrawlId != null && row.baselineCrawlId === project.latestCrawlId,
      }),
      status: isOpportunityStatus(row.status) ? row.status : "open",
      aiUsed: row.aiUsed,
      resolvedAt: row.resolvedAt,
      updatedAt: row.updatedAt,
      competitor: row.competitor,
      parts: readParts(row.parts, row.source),
    };
  });
}

export type SiteAiSummary = {
  status: string;
  summary: string | null;
  error: string | null;
  model: string;
  provider: string;
  createdAt: Date;
};

/** The latest site-level AI run, re-validated against the current contract. */
export async function getSiteAiSummary(projectId: string): Promise<SiteAiSummary | null> {
  const row = await prisma.aiResult.findFirst({
    where: { projectId, feature: "site-opportunity" },
    orderBy: { createdAt: "desc" },
    select: { status: true, output: true, error: true, model: true, provider: true, createdAt: true },
  });
  if (!row) return null;
  const parsed = row.status === "ok" ? siteOpportunitySchema.safeParse(row.output) : null;
  return {
    status: row.status,
    summary: parsed?.success ? parsed.data.summary : null,
    error: row.error,
    model: row.model,
    provider: row.provider,
    createdAt: row.createdAt,
  };
}
