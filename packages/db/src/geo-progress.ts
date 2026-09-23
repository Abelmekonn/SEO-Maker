import type { PrismaClient } from "@prisma/client";

/**
 * GEO run progress, stored on the Project row so the dashboard can poll it the
 * same way it polls PageSpeed and competitor discovery.
 *
 * Raw SQL for the same reason `perf-progress.ts` and `competitor-progress.ts`
 * use it: these keep working even when the generated client is stale after a
 * schema change, which is exactly when a job most needs to record that it
 * failed.
 */
export type GeoProgress = {
  geoStatus: string;
  geoPhase: string | null;
  geoError: string | null;
  geoRunAt: Date | null;
  geoDone: number;
  geoTotal: number;
  geoAiUsed: boolean;
  geoLatestAuditId: string | null;
};

export async function readGeoProgress(
  prisma: PrismaClient,
  projectId: string,
): Promise<GeoProgress> {
  const rows = await prisma.$queryRawUnsafe<GeoProgress[]>(
    `SELECT "geoStatus", "geoPhase", "geoError", "geoRunAt", "geoDone", "geoTotal",
            "geoAiUsed", "geoLatestAuditId"
     FROM "Project" WHERE "id" = $1`,
    projectId,
  );
  const row = rows[0];
  return {
    geoStatus: row?.geoStatus ?? "idle",
    geoPhase: row?.geoPhase ?? null,
    geoError: row?.geoError ?? null,
    geoRunAt: row?.geoRunAt ?? null,
    geoDone: row?.geoDone ?? 0,
    geoTotal: row?.geoTotal ?? 0,
    geoAiUsed: row?.geoAiUsed ?? false,
    geoLatestAuditId: row?.geoLatestAuditId ?? null,
  };
}

/**
 * Partial status update.
 *
 * COALESCE so a caller that only reports a phase cannot blank the error a
 * previous phase recorded — a partial run has to keep saying what went wrong.
 */
export async function setGeoStatus(
  prisma: PrismaClient,
  projectId: string,
  data: {
    status?: string;
    phase?: string | null;
    error?: string | null;
    total?: number;
    runAt?: Date | null;
    aiUsed?: boolean;
    latestAuditId?: string | null;
  },
) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET
       "geoStatus"        = COALESCE($2, "geoStatus"),
       "geoPhase"         = COALESCE($3, "geoPhase"),
       "geoError"         = $4,
       "geoTotal"         = COALESCE($5, "geoTotal"),
       "geoRunAt"         = COALESCE($6, "geoRunAt"),
       "geoAiUsed"        = COALESCE($7, "geoAiUsed"),
       "geoLatestAuditId" = COALESCE($8, "geoLatestAuditId")
     WHERE "id" = $1`,
    projectId,
    data.status ?? null,
    data.phase ?? null,
    // Not COALESCEd: clearing the error on a new run is deliberate, so the
    // caller passes null to mean "clear it" rather than "leave it".
    data.error ?? null,
    data.total ?? null,
    data.runAt ?? null,
    data.aiUsed ?? null,
    data.latestAuditId ?? null,
  );
}

/** Advances the phase and resets the within-phase counter. */
export async function writeGeoPhase(prisma: PrismaClient, projectId: string, phase: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET "geoPhase" = $2 WHERE "id" = $1`,
    projectId,
    phase,
  );
}

/** Atomic, so concurrent phase writes cannot lose a completed step. */
export async function incrementGeoDone(prisma: PrismaClient, projectId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET "geoDone" = "geoDone" + 1 WHERE "id" = $1`,
    projectId,
  );
}

/** Clears the previous run so a retry never shows the old run's error. */
export async function resetGeoProgress(
  prisma: PrismaClient,
  projectId: string,
  data: { status: string; total: number },
) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET
       "geoStatus" = $2, "geoPhase" = NULL, "geoError" = NULL,
       "geoDone" = 0, "geoTotal" = $3, "geoRunAt" = NOW(), "geoAiUsed" = false
     WHERE "id" = $1`,
    projectId,
    data.status,
    data.total,
  );
}
