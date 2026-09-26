-- Usage ledger for plan allowances (Free: 2 AI generations a day, 10 a week,
-- one re-crawl per site). Additive: one new table and three indexes.

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "siteKey" TEXT,
    "projectId" TEXT,
    "pageKey" TEXT,
    "features" JSONB,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "requestKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageRecord_userId_kind_createdAt_idx" ON "UsageRecord"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_userId_kind_siteKey_idx" ON "UsageRecord"("userId", "kind", "siteKey");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_userId_requestKey_key" ON "UsageRecord"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "Page_crawlId_crawlTier_idx" ON "Page"("crawlId", "crawlTier");

-- CreateIndex
CREATE INDEX "Project_userId_createdAt_idx" ON "Project"("userId", "createdAt");

-- Backfill: every crawl that already completed counts toward its site's
-- allowance, so an existing site does not get a fresh set of re-crawls. The
-- first crawl of each project is its initial crawl, the rest re-crawls.
INSERT INTO "UsageRecord" ("id", "userId", "kind", "scope", "siteKey", "projectId", "status", "createdAt", "settledAt")
SELECT
    'backfill_' || c."id",
    p."userId",
    'crawl',
    CASE WHEN ROW_NUMBER() OVER (PARTITION BY c."projectId" ORDER BY c."startedAt") = 1 THEN 'initial' ELSE 'recrawl' END,
    p."siteKey",
    p."id",
    'succeeded',
    c."startedAt",
    c."finishedAt"
FROM "Crawl" c
JOIN "Project" p ON p."id" = c."projectId"
WHERE c."status" = 'completed' AND p."siteKey" IS NOT NULL;
