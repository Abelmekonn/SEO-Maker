-- Phase 3 (Site Intelligence + Opportunities) and Phase 4 (Competitive
-- Intelligence + re-crawl comparison). Additive only: every new column is
-- nullable or defaulted, and the two unique indexes cover columns that are
-- empty on every existing row.

-- AlterTable
ALTER TABLE "AiResult" ADD COLUMN     "competitorId" TEXT;

-- AlterTable
ALTER TABLE "CompetitorAnalysis" ADD COLUMN     "comparison" JSONB;

-- AlterTable
ALTER TABLE "CompetitorPage" ADD COLUMN     "headings" JSONB;

-- AlterTable
ALTER TABLE "ContentGap" ADD COLUMN     "key" TEXT;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "affectedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "affectedUrls" JSONB,
ADD COLUMN     "aiResultId" TEXT,
ADD COLUMN     "baselineCount" INTEGER,
ADD COLUMN     "baselineCrawlId" TEXT,
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "crawlId" TEXT,
ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'site';

-- CreateIndex
CREATE INDEX "AiResult_competitorId_feature_createdAt_idx" ON "AiResult"("competitorId", "feature", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentGap_projectId_key_key" ON "ContentGap"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_projectId_key_key" ON "Opportunity"("projectId", "key");

-- AddForeignKey
ALTER TABLE "AiResult" ADD CONSTRAINT "AiResult_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

