/*
  Warnings:

  - Added the required column `updatedAt` to the `Page` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "content" TEXT,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "crawlId" TEXT,
ADD COLUMN     "depth" INTEGER,
ADD COLUMN     "discoveredVia" TEXT,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "errorType" TEXT,
ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "externalLinks" INTEGER,
ADD COLUMN     "h1Count" INTEGER,
ADD COLUMN     "h3Count" INTEGER,
ADD COLUMN     "inSitemap" BOOLEAN,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "pageTypeScore" DOUBLE PRECISION,
ADD COLUMN     "redirectCount" INTEGER,
ADD COLUMN     "responseTimeMs" INTEGER,
ADD COLUMN     "robotsDisallowed" BOOLEAN,
ADD COLUMN     "robotsMeta" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PerformanceAudit" ADD COLUMN     "speedIndex" DOUBLE PRECISION,
ADD COLUMN     "ttfb" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "analysisMode" TEXT NOT NULL DEFAULT 'quick',
ADD COLUMN     "businessDescription" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "contextUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "latestCrawlId" TEXT,
ADD COLUMN     "primaryGoal" TEXT,
ADD COLUMN     "servicesProducts" JSONB,
ADD COLUMN     "targetAudience" TEXT,
ADD COLUMN     "targetKeywords" JSONB,
ADD COLUMN     "targetLocation" TEXT;

-- CreateTable
CREATE TABLE "Crawl" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "maxPages" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "queued" INTEGER NOT NULL DEFAULT 0,
    "crawled" INTEGER NOT NULL DEFAULT 0,
    "analyzed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "robotsAudit" JSONB,
    "sitemapAudit" JSONB,
    "seedPlan" JSONB,
    "seoScore" DOUBLE PRECISION,
    "technicalScore" DOUBLE PRECISION,
    "onPageScore" DOUBLE PRECISION,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Crawl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageIssue" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" TEXT,
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiResult" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "feature" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'quick',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "knowledgeVersion" TEXT,
    "inputHash" TEXT NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Crawl_projectId_startedAt_idx" ON "Crawl"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "PageIssue_crawlId_severity_idx" ON "PageIssue"("crawlId", "severity");

-- CreateIndex
CREATE INDEX "PageIssue_crawlId_checkId_idx" ON "PageIssue"("crawlId", "checkId");

-- CreateIndex
CREATE UNIQUE INDEX "PageIssue_pageId_checkId_key" ON "PageIssue"("pageId", "checkId");

-- CreateIndex
CREATE INDEX "AiResult_projectId_feature_idx" ON "AiResult"("projectId", "feature");

-- CreateIndex
CREATE INDEX "AiResult_pageId_feature_idx" ON "AiResult"("pageId", "feature");

-- CreateIndex
CREATE INDEX "AiResult_inputHash_idx" ON "AiResult"("inputHash");

-- CreateIndex
CREATE INDEX "Page_crawlId_idx" ON "Page"("crawlId");

-- CreateIndex
CREATE INDEX "Page_crawlId_status_idx" ON "Page"("crawlId", "status");

-- AddForeignKey
ALTER TABLE "Crawl" ADD CONSTRAINT "Crawl_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageIssue" ADD CONSTRAINT "PageIssue_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageIssue" ADD CONSTRAINT "PageIssue_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiResult" ADD CONSTRAINT "AiResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiResult" ADD CONSTRAINT "AiResult_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
