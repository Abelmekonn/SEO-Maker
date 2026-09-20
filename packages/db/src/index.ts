import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient } from "@prisma/client";
export type {
  Competitor,
  CompetitorAnalysis,
  CompetitorPage,
  CompetitorQuery,
  ContentGap,
  Opportunity,
  Page,
  PerformanceAudit,
  Project,
  SerpResult,
} from "@prisma/client";
export {
  incrementPerfDone,
  readPerfProgress,
  writePerfProgress,
  type PerfProgress,
} from "./perf-progress";
export {
  incrementCompetitorDone,
  incrementCompetitorPhaseDone,
  readCompetitorProgress,
  resetCompetitorProgress,
  setCompetitorStatus,
  writeCompetitorPhase,
  type CompetitorProgress,
} from "./competitor-progress";
