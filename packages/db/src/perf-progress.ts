import type { PrismaClient } from "@prisma/client";

export type PerfProgress = {
  perfDone: number;
  perfTotal: number;
  perfPageIds: unknown;
};

export async function readPerfProgress(
  prisma: PrismaClient,
  projectId: string,
): Promise<PerfProgress> {
  const rows = await prisma.$queryRawUnsafe<PerfProgress[]>(
    `SELECT "perfDone", "perfTotal", "perfPageIds" FROM "Project" WHERE "id" = $1`,
    projectId,
  );
  const row = rows[0];
  return {
    perfDone: row?.perfDone ?? 0,
    perfTotal: row?.perfTotal ?? 0,
    perfPageIds: row?.perfPageIds ?? null,
  };
}

export async function writePerfProgress(
  prisma: PrismaClient,
  projectId: string,
  data: { done: number; total: number; pageIds: string[] },
) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET "perfDone" = $1, "perfTotal" = $2, "perfPageIds" = $3::jsonb WHERE "id" = $4`,
    data.done,
    data.total,
    JSON.stringify(data.pageIds),
    projectId,
  );
}

export async function incrementPerfDone(prisma: PrismaClient, projectId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "Project" SET "perfDone" = "perfDone" + 1 WHERE "id" = $1`,
    projectId,
  );
}
