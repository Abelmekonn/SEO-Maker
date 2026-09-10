ALTER TABLE "Project"
ADD COLUMN     "perfStatus" TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN     "perfError" TEXT,
ADD COLUMN     "perfRunAt" TIMESTAMP(3);
