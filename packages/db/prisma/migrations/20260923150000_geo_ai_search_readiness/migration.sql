-- GEO / AI Search Readiness. Purely additive: one nullable column on Crawl,
-- nine defaulted columns on Project, and seven new tables.
--
-- Deliberately NOT included: `ALTER TABLE "Page" ALTER COLUMN "updatedAt" DROP
-- DEFAULT`. `prisma migrate diff` emits it because the phase0 migration added
-- that default so the column could be created on a non-empty Page table, while
-- the schema declares @updatedAt with no default. That drift predates this
-- work and is unrelated to GEO, so it belongs in its own migration.

-- AlterTable
ALTER TABLE "Crawl" ADD COLUMN     "robotsTxt" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "aiVisibilityStatus" TEXT NOT NULL DEFAULT 'not_configured',
ADD COLUMN     "geoAiUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "geoDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "geoError" TEXT,
ADD COLUMN     "geoLatestAuditId" TEXT,
ADD COLUMN     "geoPhase" TEXT,
ADD COLUMN     "geoRunAt" TIMESTAMP(3),
ADD COLUMN     "geoStatus" TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN     "geoTotal" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GeoAudit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "crawlId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "phase" TEXT,
    "error" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'quick',
    "trigger" TEXT NOT NULL DEFAULT 'crawl',
    "inputFingerprint" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "aiAvailable" BOOLEAN NOT NULL DEFAULT false,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "readinessScore" DOUBLE PRECISION,
    "readinessBand" TEXT,
    "entityClarity" DOUBLE PRECISION,
    "contentExtractability" DOUBLE PRECISION,
    "answerCoverage" DOUBLE PRECISION,
    "structuredData" DOUBLE PRECISION,
    "aiCrawlerAccess" DOUBLE PRECISION,
    "citationReadiness" DOUBLE PRECISION,
    "businessInfo" DOUBLE PRECISION,
    "measuredWeights" JSONB,
    "notMeasured" JSONB,
    "parts" JSONB,
    "basis" JSONB,
    "pagesSelected" INTEGER NOT NULL DEFAULT 0,
    "pagesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "deferredPages" JSONB,
    "tokensEstimated" INTEGER,
    "aiCalls" INTEGER NOT NULL DEFAULT 0,
    "aiFailures" INTEGER NOT NULL DEFAULT 0,
    "crawlerMatrix" JSONB,
    "entityFacets" JSONB,
    "extractability" JSONB,
    "schemaCensus" JSONB,
    "businessInfoItems" JSONB,
    "citationSignals" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GeoAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBusinessProfile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "geoAuditId" TEXT NOT NULL,
    "businessName" TEXT,
    "businessNameConfidence" DOUBLE PRECISION,
    "businessType" TEXT,
    "businessTypeConfidence" DOUBLE PRECISION,
    "industry" TEXT,
    "industryConfidence" DOUBLE PRECISION,
    "description" TEXT,
    "descriptionConfidence" DOUBLE PRECISION,
    "locationRelevance" TEXT,
    "hasPhysicalPremises" BOOLEAN,
    "confidence" DOUBLE PRECISION,
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT true,
    "groundedIn" JSONB NOT NULL,
    "verifiedFacets" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "aiResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEntity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "description" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceUrls" JSONB NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedPageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEntityRelationship" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceUrls" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEntityRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnswerOpportunity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "geoAuditId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "questionHash" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "topic" TEXT,
    "relatedEntityId" TEXT,
    "relatedService" TEXT,
    "answerTerms" JSONB NOT NULL,
    "disqualifiers" JSONB,
    "importance" DOUBLE PRECISION,
    "coverageStatus" TEXT NOT NULL,
    "coverageScore" DOUBLE PRECISION NOT NULL,
    "matchedPageId" TEXT,
    "matchedHeading" TEXT,
    "matchedExcerpt" TEXT,
    "verifiedByAi" BOOLEAN NOT NULL DEFAULT false,
    "missingAspects" JSONB,
    "promotable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnswerOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCitationOpportunity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "geoAuditId" TEXT NOT NULL,
    "pageId" TEXT,
    "signal" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "observed" JSONB,
    "claimText" TEXT,
    "claimKind" TEXT,
    "supportType" TEXT,
    "claimVerified" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCitationOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoOpportunity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "geoAuditId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "priority" DOUBLE PRECISION NOT NULL,
    "priorityBand" TEXT NOT NULL,
    "priorityParts" JSONB,
    "estimatedEffort" TEXT NOT NULL,
    "dimension" TEXT,
    "affectedPageIds" JSONB NOT NULL,
    "affectedUrls" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "aiResultId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoAudit_projectId_startedAt_idx" ON "GeoAudit"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "GeoAudit_projectId_status_idx" ON "GeoAudit"("projectId", "status");

-- CreateIndex
CREATE INDEX "GeoAudit_projectId_inputFingerprint_idx" ON "GeoAudit"("projectId", "inputFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AiBusinessProfile_geoAuditId_key" ON "AiBusinessProfile"("geoAuditId");

-- CreateIndex
CREATE INDEX "AiBusinessProfile_projectId_createdAt_idx" ON "AiBusinessProfile"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiEntity_projectId_kind_idx" ON "AiEntity"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AiEntity_profileId_kind_normalized_key" ON "AiEntity"("profileId", "kind", "normalized");

-- CreateIndex
CREATE INDEX "AiEntityRelationship_profileId_idx" ON "AiEntityRelationship"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "AiEntityRelationship_profileId_fromEntityId_toEntityId_kind_key" ON "AiEntityRelationship"("profileId", "fromEntityId", "toEntityId", "kind");

-- CreateIndex
CREATE INDEX "AiAnswerOpportunity_geoAuditId_coverageStatus_idx" ON "AiAnswerOpportunity"("geoAuditId", "coverageStatus");

-- CreateIndex
CREATE INDEX "AiAnswerOpportunity_projectId_questionHash_idx" ON "AiAnswerOpportunity"("projectId", "questionHash");

-- CreateIndex
CREATE UNIQUE INDEX "AiAnswerOpportunity_geoAuditId_questionHash_key" ON "AiAnswerOpportunity"("geoAuditId", "questionHash");

-- CreateIndex
CREATE INDEX "AiCitationOpportunity_geoAuditId_signal_idx" ON "AiCitationOpportunity"("geoAuditId", "signal");

-- CreateIndex
CREATE INDEX "AiCitationOpportunity_pageId_idx" ON "AiCitationOpportunity"("pageId");

-- CreateIndex
CREATE INDEX "GeoOpportunity_projectId_status_priority_idx" ON "GeoOpportunity"("projectId", "status", "priority");

-- CreateIndex
CREATE INDEX "GeoOpportunity_geoAuditId_type_idx" ON "GeoOpportunity"("geoAuditId", "type");

-- AddForeignKey
ALTER TABLE "GeoAudit" ADD CONSTRAINT "GeoAudit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoAudit" ADD CONSTRAINT "GeoAudit_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBusinessProfile" ADD CONSTRAINT "AiBusinessProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBusinessProfile" ADD CONSTRAINT "AiBusinessProfile_geoAuditId_fkey" FOREIGN KEY ("geoAuditId") REFERENCES "GeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEntity" ADD CONSTRAINT "AiEntity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEntity" ADD CONSTRAINT "AiEntity_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AiBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEntityRelationship" ADD CONSTRAINT "AiEntityRelationship_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEntityRelationship" ADD CONSTRAINT "AiEntityRelationship_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AiBusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEntityRelationship" ADD CONSTRAINT "AiEntityRelationship_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "AiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEntityRelationship" ADD CONSTRAINT "AiEntityRelationship_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "AiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnswerOpportunity" ADD CONSTRAINT "AiAnswerOpportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnswerOpportunity" ADD CONSTRAINT "AiAnswerOpportunity_geoAuditId_fkey" FOREIGN KEY ("geoAuditId") REFERENCES "GeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnswerOpportunity" ADD CONSTRAINT "AiAnswerOpportunity_matchedPageId_fkey" FOREIGN KEY ("matchedPageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCitationOpportunity" ADD CONSTRAINT "AiCitationOpportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCitationOpportunity" ADD CONSTRAINT "AiCitationOpportunity_geoAuditId_fkey" FOREIGN KEY ("geoAuditId") REFERENCES "GeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCitationOpportunity" ADD CONSTRAINT "AiCitationOpportunity_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoOpportunity" ADD CONSTRAINT "GeoOpportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoOpportunity" ADD CONSTRAINT "GeoOpportunity_geoAuditId_fkey" FOREIGN KEY ("geoAuditId") REFERENCES "GeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

