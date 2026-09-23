-- AlterTable
ALTER TABLE "Project" ADD COLUMN "siteKey" TEXT;

-- Backfill the normalised site identity: lower-cased host without "www.",
-- plus any path, without query, fragment or trailing slash. Only the oldest
-- project per user and site gets the key, so a duplicate added before this
-- constraint existed cannot block the unique index; it keeps a NULL key until
-- its owner deletes it.
WITH keyed AS (
  SELECT
    id,
    regexp_replace(regexp_replace(regexp_replace(lower("rootUrl"), '^https?://(www\.)?', ''), '[?#].*$', ''), '/+$', '') AS key,
    row_number() OVER (
      PARTITION BY "userId",
        regexp_replace(regexp_replace(regexp_replace(lower("rootUrl"), '^https?://(www\.)?', ''), '[?#].*$', ''), '/+$', '')
      ORDER BY "createdAt"
    ) AS rn
  FROM "Project"
)
UPDATE "Project" AS p
SET "siteKey" = keyed.key
FROM keyed
WHERE keyed.id = p.id AND keyed.rn = 1;

-- CreateIndex
CREATE UNIQUE INDEX "Project_userId_siteKey_key" ON "Project"("userId", "siteKey");
