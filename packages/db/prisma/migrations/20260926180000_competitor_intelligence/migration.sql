-- Competitor intelligence: generated search queries keep their priority and
-- reason, and a discovery run stores what it found. Additive and nullable:
-- existing rows stay valid.

-- AlterTable
ALTER TABLE "CompetitorQuery" ADD COLUMN     "priority" TEXT,
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "compResult" JSONB;
