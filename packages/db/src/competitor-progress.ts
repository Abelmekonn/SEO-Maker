import type { PrismaClient } from "@prisma/client";

/**
 * Competitor discovery progress, stored on the Project row so the dashboard can
 * poll it the same way it polls PageSpeed progress.
 *
 * Raw SQL for the same reason `perf-progress.ts` uses it: these keep working
 * even when the generated client is stale after a schema change.
 */
export type CompetitorProgress = {
  compStatus: string;
  compPhase: string | null;
  compError: string | null;
  compRunAt: Date | null;
  compDone: number;
  compTotal: number;
  compPhaseDone: number;
  compPhaseTotal: number;
  compProviderOk: boolean;
  compAiUsed: boolean;
};

export async function readCompetitorProgress(
  prisma: PrismaClient,
  projectId: string,
): Promise<CompetitorProgress> {
  const rows = await prisma.$queryRawUnsafe<CompetitorProgress[]>(
    `SELECT "compStatus", "compPhase", "compError", "compRunAt", "compDone", "compTotal",
            "compPhaseDone", "compPhaseTotal", "compProviderOk", "compAiUsed"
     FROM "Project" WHERE "id" = $1`,
    projectId,
  );
  const row = rows[0];
  return {
    compStatus: row?.compStatus ?? "idle",
    compPhase: row?.compPhase ?? null,
    compError: row?.compError ?? null,
    compRunAt: row?.compRunAt ?? null,
    compDone: row?.compDone ?? 0,
    compTotal: row?.compTotal ?? 0,
    compPhaseDone: row?.compPhaseDone ?? 0,
    compPhaseTotal: row?.compPhaseTotal ?? 0,
    compProviderOk: row?.compProviderOk ?? false,
    compAiUsed: row?.compAiUsed ?? false,
  };
}

export async function setCompetitorStatus(
  prisma: PrismaClient,
  projectId: string,
  data: {
    status: string;
    error?: string | null;
    phase?: string | null;
    total?: number;
    runAt?: Date | null;
    providerOk?: boolean;
    aiUsed?: boolean;
  },
) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET
       "compStatus" = $1,
       "compError" = $2,
       "compPhase" = $3,
       "compTotal" = COALESCE($4, "compTotal"),
       "compRunAt" = COALESCE($5, "compRunAt"),
       "compProviderOk" = COALESCE($6, "compProviderOk"),
       "compAiUsed" = COALESCE($7, "compAiUsed")
     WHERE "id" = $8`,
    data.status,
    data.error ?? null,
    data.phase ?? null,
    data.total ?? null,
    data.runAt ?? null,
    data.providerOk ?? null,
    data.aiUsed ?? null,
    projectId,
  );
}

export async function writeCompetitorPhase(
  prisma: PrismaClient,
  projectId: string,
  data: { phase: string; phaseDone: number; phaseTotal: number },
) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET "compPhase" = $1, "compPhaseDone" = $2, "compPhaseTotal" = $3 WHERE "id" = $4`,
    data.phase,
    data.phaseDone,
    data.phaseTotal,
    projectId,
  );
}

export async function resetCompetitorProgress(
  prisma: PrismaClient,
  projectId: string,
  data: { status: string; total: number; providerOk: boolean },
) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET
       "compStatus" = $1, "compError" = NULL, "compPhase" = NULL,
       "compDone" = 0, "compTotal" = $2,
       "compPhaseDone" = 0, "compPhaseTotal" = 0,
       "compProviderOk" = $3, "compAiUsed" = false
     WHERE "id" = $4`,
    data.status,
    data.total,
    data.providerOk,
    projectId,
  );
}

export async function incrementCompetitorDone(prisma: PrismaClient, projectId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET "compDone" = "compDone" + 1 WHERE "id" = $1`,
    projectId,
  );
}

export async function incrementCompetitorPhaseDone(prisma: PrismaClient, projectId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET "compPhaseDone" = "compPhaseDone" + 1 WHERE "id" = $1`,
    projectId,
  );
}
