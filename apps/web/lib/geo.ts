import {
  GEO_DIMENSION_LABELS,
  type GeoDimensionId,
  type NotMeasuredReason,
} from "@seo-maker/core/geo";
import { prisma } from "@seo-maker/db";

/** Project-level states that mean a GEO run is in flight. */
export const GEO_ACTIVE = new Set(["queued", "running"]);

export function relativeTime(date: Date | null | undefined) {
  if (!date) return null;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export type DimensionRow = {
  id: GeoDimensionId;
  label: string;
  /** 0-100, or null when the run could not measure it. */
  value: number | null;
  /** Weight after redistribution, so a stored score can be audited on screen. */
  weight: number | null;
  reason: string | null;
};

export async function getLatestGeoAudit(projectId: string) {
  return prisma.geoAudit.findFirst({
    where: { projectId },
    orderBy: { startedAt: "desc" },
  });
}

/** Open findings from the latest run, most urgent first. */
export async function getGeoOpportunities(projectId: string, geoAuditId?: string) {
  return prisma.geoOpportunity.findMany({
    where: { projectId, ...(geoAuditId ? { geoAuditId } : {}) },
    orderBy: [{ status: "asc" }, { priority: "desc" }],
  });
}

export async function getCitationSignals(projectId: string, geoAuditId?: string) {
  return prisma.aiCitationOpportunity.findMany({
    where: { projectId, ...(geoAuditId ? { geoAuditId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Competitors, with whatever AI-search evidence exists for them.
 *
 * There is none today: GEO analysis only runs against the user's own site, so
 * every AI column here is null and the page says so rather than reusing the
 * SEO score under an AI heading.
 */
export async function getCompetitorsForAiSearch(projectId: string) {
  return prisma.competitor.findMany({
    where: { projectId, excluded: false },
    orderBy: [{ pinned: "desc" }, { confidence: "desc" }, { createdAt: "asc" }],
  });
}

export async function getGeoAuditHistory(projectId: string, take = 10) {
  return prisma.geoAudit.findMany({
    where: { projectId, status: { in: ["completed", "partial"] } },
    orderBy: { startedAt: "desc" },
    take,
  });
}

const DIMENSION_IDS: GeoDimensionId[] = [
  "entityClarity",
  "contentExtractability",
  "answerCoverage",
  "structuredData",
  "aiCrawlerAccess",
  "citationReadiness",
  "businessInfo",
];

/**
 * The seven dimensions as the UI renders them.
 *
 * A null value is never converted to a number here. It carries its reason
 * through to the screen, which is the difference between "scored badly" and
 * "we could not measure this".
 */
export function dimensionRows(
  audit: Record<string, unknown> | null,
): DimensionRow[] {
  const weights = (audit?.measuredWeights ?? null) as Record<string, number> | null;
  const reasons = (audit?.notMeasured ?? null) as NotMeasuredReason[] | null;

  return DIMENSION_IDS.map((id) => {
    const raw = audit?.[id];
    const value = typeof raw === "number" ? Math.round(raw * 100) : null;
    return {
      id,
      label: GEO_DIMENSION_LABELS[id],
      value,
      weight: weights?.[id] ?? null,
      reason: reasons?.find((entry) => entry.dimension === id)?.reason ?? null,
    };
  });
}

/**
 * How much of the original weight was actually measured, 0-1.
 *
 * Redistribution will happily return 100 from a single measured dimension.
 * That is correct arithmetic and a misleading headline, so the score is never
 * shown without this beside it.
 */
export function measuredCoverage(rows: DimensionRow[]): number {
  const GEO_WEIGHTS: Record<GeoDimensionId, number> = {
    entityClarity: 20,
    contentExtractability: 15,
    answerCoverage: 15,
    structuredData: 15,
    aiCrawlerAccess: 15,
    citationReadiness: 10,
    businessInfo: 10,
  };

  return (
    rows
      .filter((row) => row.value != null)
      .reduce((sum, row) => sum + GEO_WEIGHTS[row.id], 0) / 100
  );
}
