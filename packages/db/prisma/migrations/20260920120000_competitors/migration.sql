-- AlterTable
ALTER TABLE "Competitor" ADD COLUMN     "audience" TEXT,
ADD COLUMN     "avgPosition" DOUBLE PRECISION,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "confidenceBand" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "crawlDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "crawlTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "excluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "lastAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "lastCrawledAt" TIMESTAMP(3),
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "queryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "statusError" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "topQueryCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CompetitorPage" ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "finalUrl" TEXT,
ADD COLUMN     "h2Count" INTEGER,
ADD COLUMN     "indexable" BOOLEAN,
ADD COLUMN     "isHttps" BOOLEAN,
ADD COLUMN     "missingAlt" INTEGER,
ADD COLUMN     "pageType" TEXT,
ADD COLUMN     "schemaCount" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "statusCode" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "xRobotsTag" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "compAiUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "compDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "compError" TEXT,
ADD COLUMN     "compPhase" TEXT,
ADD COLUMN     "compPhaseDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "compPhaseTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "compProviderOk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "compRunAt" TIMESTAMP(3),
ADD COLUMN     "compStatus" TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN     "compTotal" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CompetitorQuery" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'informational',
    "locationCode" INTEGER NOT NULL DEFAULT 2840,
    "languageCode" TEXT NOT NULL DEFAULT 'en',
    "relevance" DOUBLE PRECISION,
    "searchVolume" INTEGER,
    "difficulty" DOUBLE PRECISION,
    "cpc" DOUBLE PRECISION,
    "selfPosition" INTEGER,
    "selfUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpResult" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "resultType" TEXT NOT NULL DEFAULT 'organic',
    "provider" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerpResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorAnalysis" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "seoScore" DOUBLE PRECISION,
    "technicalScore" DOUBLE PRECISION,
    "onPageScore" DOUBLE PRECISION,
    "contentScore" DOUBLE PRECISION,
    "performanceScore" DOUBLE PRECISION,
    "internalLinksScore" DOUBLE PRECISION,
    "structuredDataScore" DOUBLE PRECISION,
    "measuredWeights" JSONB,
    "notMeasured" JSONB,
    "confidence" DOUBLE PRECISION,
    "confidenceParts" JSONB,
    "pagesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "avgWordCount" DOUBLE PRECISION,
    "avgInternalLinks" DOUBLE PRECISION,
    "schemaCoverage" DOUBLE PRECISION,
    "summary" TEXT,
    "strengths" JSONB,
    "weaknesses" JSONB,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentGap" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "query" TEXT,
    "selfUrl" TEXT,
    "selfWordCount" INTEGER,
    "competitorCount" INTEGER NOT NULL DEFAULT 0,
    "competitorIds" JSONB,
    "avgCompetitorWordCount" DOUBLE PRECISION,
    "bestCompetitorUrl" TEXT,
    "searchVolume" INTEGER,
    "relevance" DOUBLE PRECISION,
    "businessValue" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gapId" TEXT,
    "competitorId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT,
    "action" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "parts" JSONB,
    "effort" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitorQuery_projectId_idx" ON "CompetitorQuery"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorQuery_projectId_query_locationCode_languageCode_key" ON "CompetitorQuery"("projectId", "query", "locationCode", "languageCode");

-- CreateIndex
CREATE INDEX "SerpResult_queryId_idx" ON "SerpResult"("queryId");

-- CreateIndex
CREATE INDEX "SerpResult_domain_idx" ON "SerpResult"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "SerpResult_queryId_position_resultType_key" ON "SerpResult"("queryId", "position", "resultType");

-- CreateIndex
CREATE INDEX "CompetitorAnalysis_competitorId_createdAt_idx" ON "CompetitorAnalysis"("competitorId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentGap_projectId_status_idx" ON "ContentGap"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_gapId_key" ON "Opportunity"("gapId");

-- CreateIndex
CREATE INDEX "Opportunity_projectId_status_score_idx" ON "Opportunity"("projectId", "status", "score");

-- CreateIndex
CREATE INDEX "Competitor_projectId_status_idx" ON "Competitor"("projectId", "status");

-- CreateIndex
CREATE INDEX "Competitor_projectId_confidence_idx" ON "Competitor"("projectId", "confidence");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorPage_competitorId_url_key" ON "CompetitorPage"("competitorId", "url");

-- AddForeignKey
ALTER TABLE "CompetitorQuery" ADD CONSTRAINT "CompetitorQuery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpResult" ADD CONSTRAINT "SerpResult_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "CompetitorQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorAnalysis" ADD CONSTRAINT "CompetitorAnalysis_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentGap" ADD CONSTRAINT "ContentGap_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_gapId_fkey" FOREIGN KEY ("gapId") REFERENCES "ContentGap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

