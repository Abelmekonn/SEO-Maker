-- Discover first, then crawl. Additive only: a new table for the site's page
-- inventory with each page's stored Priority / Standard classification, and
-- discovery progress on Project. Projects crawled before this have no
-- inventory rows; the app seeds them from their latest crawl on first use.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "discoveryAt" TIMESTAMP(3),
ADD COLUMN     "discoveryError" TEXT,
ADD COLUMN     "discoveryMode" TEXT,
ADD COLUMN     "discoveryResult" JSONB,
ADD COLUMN     "discoveryStatus" TEXT NOT NULL DEFAULT 'idle';

-- CreateTable
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "homepage" BOOLEAN NOT NULL DEFAULT false,
    "tier" TEXT NOT NULL,
    "tierSource" TEXT NOT NULL DEFAULT 'auto',
    "autoTier" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "pageType" TEXT,
    "reasons" JSONB,
    "sources" JSONB,
    "inSitemap" BOOLEAN NOT NULL DEFAULT false,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCrawledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitePage_projectId_tier_idx" ON "SitePage"("projectId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_projectId_pageKey_key" ON "SitePage"("projectId", "pageKey");

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
