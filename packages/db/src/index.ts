import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma, PrismaClient } from "@prisma/client";
export type {
  AiResult,
  Competitor,
  CompetitorAnalysis,
  CompetitorPage,
  CompetitorQuery,
  ContentGap,
  Crawl,
  KnowledgeItem,
  KnowledgePolicy,
  Opportunity,
  Page,
  PageIssue,
  PerformanceAudit,
  Project,
  SerpResult,
  SitePage,
  UsageRecord,
} from "@prisma/client";
export {
  AI_RESERVATION_TTL_MS,
  CRAWL_RESERVATION_TTL_MS,
  DAY_MS,
  WEEK_MS,
  expireStaleReservations,
  getAiQuota,
  getCrawlAllowance,
  quotaFrom,
  reserveAiGeneration,
  reserveCrawl,
  rollingWindow,
  settleUsage,
  type AiLimits,
  type AiQuota,
  type CrawlAllowance,
  type ReserveAiInput,
  type ReserveAiResult,
  type ReserveCrawlResult,
  type UsageStatus,
  type UsageWindow,
} from "./usage";
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
  writeCompetitorResult,
  type CompetitorProgress,
} from "./competitor-progress";
