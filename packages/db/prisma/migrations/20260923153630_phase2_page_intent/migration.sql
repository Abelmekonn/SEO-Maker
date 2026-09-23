-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "searchIntent" TEXT,
ADD COLUMN     "searchIntentScore" DOUBLE PRECISION,
ALTER COLUMN "updatedAt" DROP DEFAULT;
