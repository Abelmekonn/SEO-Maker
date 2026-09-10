-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rootUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxPages" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageType" TEXT,
    "title" TEXT,
    "metaDesc" TEXT,
    "h1" TEXT,
    "wordCount" INTEGER,
    "seoSuggestion" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceAudit" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "performance" DOUBLE PRECISION,
    "accessibility" DOUBLE PRECISION,
    "bestPractices" DOUBLE PRECISION,
    "seo" DOUBLE PRECISION,
    "fcp" DOUBLE PRECISION,
    "lcp" DOUBLE PRECISION,
    "cls" DOUBLE PRECISION,
    "tbt" DOUBLE PRECISION,
    "inp" DOUBLE PRECISION,
    "rawData" JSONB,
    "opportunities" JSONB,
    "diagnostics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "seoScore" DOUBLE PRECISION,
    "performance" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPage" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1" TEXT,
    "wordCount" INTEGER,
    "internalLinks" INTEGER,
    "imageCount" INTEGER,
    "schema" JSONB,
    "seoScore" DOUBLE PRECISION,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Page_projectId_idx" ON "Page"("projectId");

-- CreateIndex
CREATE INDEX "PerformanceAudit_pageId_idx" ON "PerformanceAudit"("pageId");

-- CreateIndex
CREATE INDEX "Competitor_projectId_idx" ON "Competitor"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_projectId_domain_key" ON "Competitor"("projectId", "domain");

-- CreateIndex
CREATE INDEX "CompetitorPage_competitorId_idx" ON "CompetitorPage"("competitorId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceAudit" ADD CONSTRAINT "PerformanceAudit_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPage" ADD CONSTRAINT "CompetitorPage_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
