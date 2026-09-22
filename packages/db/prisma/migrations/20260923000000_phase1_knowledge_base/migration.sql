-- Phase 1.5: the knowledge layer.
--
-- KnowledgeItem is a query index over knowledge/knowledge-corpus.json, which
-- stays the authored source of truth. Rows are replaced wholesale by
-- `pnpm knowledge:ingest`, so the file and the table cannot drift.
--
-- KnowledgePolicy holds the resolved conflicts. A policy overrides an item's
-- own phrasing, which is why it is a table rather than prose in a prompt.

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "subtopic" TEXT,
    "knowledgeType" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "principle" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "appliesWhen" JSONB NOT NULL,
    "doesNotApplyWhen" JSONB NOT NULL,
    "relatedIssues" JSONB NOT NULL,
    "relatedKnowledge" JSONB NOT NULL,
    "checks" TEXT[],
    "applicability" TEXT[],
    "entities" TEXT[],
    "tags" TEXT[],
    "pageTypes" TEXT[],
    "evidenceType" TEXT NOT NULL,
    "evidenceStrength" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourcePublisher" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceLocation" TEXT,
    "sourceQuote" TEXT,
    "sourceLocalPath" TEXT,
    "verified" BOOLEAN NOT NULL,
    "sourceSupport" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "supersededBy" TEXT,
    "governingPolicies" TEXT[],
    "version" TEXT NOT NULL,
    "lastVerified" TEXT,
    "reviewBy" TEXT,
    "corpusVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgePolicy" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "directive" TEXT NOT NULL,
    "neverSay" JSONB NOT NULL,
    "losingClaim" TEXT NOT NULL,
    "caveat" TEXT,
    "appliesToItems" TEXT[],
    "appliesToChecks" TEXT[],
    "confidence" TEXT NOT NULL,
    "corpusVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeItem_status_knowledgeType_idx" ON "KnowledgeItem"("status", "knowledgeType");

-- CreateIndex
CREATE INDEX "KnowledgeItem_topic_idx" ON "KnowledgeItem"("topic");

-- CreateIndex
CREATE INDEX "KnowledgeItem_domain_category_idx" ON "KnowledgeItem"("domain", "category");
