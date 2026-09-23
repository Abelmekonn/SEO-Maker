-- PageSpeed and AI results are read by page URL (pageKey), not by the crawl's
-- page row, so a re-crawl keeps them. The key below must match pageKeyOf() in
-- @seo-maker/core/crawl: scheme and "www." dropped, trailing slash trimmed.

-- PerformanceAudit: project and page key, filled from the page each row belongs to.
ALTER TABLE "PerformanceAudit" ADD COLUMN "projectId" TEXT;
ALTER TABLE "PerformanceAudit" ADD COLUMN "pageKey" TEXT;

UPDATE "PerformanceAudit" AS a
SET "projectId" = p."projectId",
    "pageKey" = regexp_replace(
      regexp_replace(COALESCE(p."finalUrl", p."url"), '^https?://(www\.)?', '', 'i'),
      '/+($|\?)', '\1'
    )
FROM "Page" AS p
WHERE p."id" = a."pageId";

ALTER TABLE "PerformanceAudit" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "PerformanceAudit" ALTER COLUMN "pageKey" SET NOT NULL;
ALTER TABLE "PerformanceAudit" ALTER COLUMN "pageId" DROP NOT NULL;

-- Pruning an old crawl no longer deletes its measurements.
ALTER TABLE "PerformanceAudit" DROP CONSTRAINT "PerformanceAudit_pageId_fkey";
ALTER TABLE "PerformanceAudit" ADD CONSTRAINT "PerformanceAudit_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PerformanceAudit" ADD CONSTRAINT "PerformanceAudit_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PerformanceAudit_projectId_pageKey_strategy_createdAt_idx"
  ON "PerformanceAudit"("projectId", "pageKey", "strategy", "createdAt");

-- AiResult: page key for page-level rows; site-level rows keep it null.
ALTER TABLE "AiResult" ADD COLUMN "pageKey" TEXT;

UPDATE "AiResult" AS r
SET "pageKey" = regexp_replace(
      regexp_replace(COALESCE(p."finalUrl", p."url"), '^https?://(www\.)?', '', 'i'),
      '/+($|\?)', '\1'
    )
FROM "Page" AS p
WHERE p."id" = r."pageId";

ALTER TABLE "AiResult" DROP CONSTRAINT "AiResult_pageId_fkey";
ALTER TABLE "AiResult" ADD CONSTRAINT "AiResult_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AiResult_projectId_pageKey_feature_createdAt_idx"
  ON "AiResult"("projectId", "pageKey", "feature", "createdAt");
