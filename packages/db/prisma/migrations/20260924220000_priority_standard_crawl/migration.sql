-- Priority Crawl / Standard Crawl. Additive only: two nullable columns and a
-- new table, so every existing crawl, page and project reads as before. Pages
-- crawled before this carry no tier; crawls before this have no inventory, and
-- the app rebuilds a plan preview from their page rows instead.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "pagePriorityOverrides" JSONB;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "crawlTier" TEXT;

-- CreateTable
CREATE TABLE "CrawlInventory" (
    "crawlId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlInventory_pkey" PRIMARY KEY ("crawlId")
);

-- AddForeignKey
ALTER TABLE "CrawlInventory" ADD CONSTRAINT "CrawlInventory_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;
