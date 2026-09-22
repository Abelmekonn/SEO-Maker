/**
 * Knowledge ingestion (Phase 1.6).
 *
 *   knowledge/knowledge-corpus.json  ->  KnowledgeItem + KnowledgePolicy
 *
 * The corpus file stays the authored source of truth; this table is a query
 * index over it. Ingestion is therefore a full replace inside one transaction:
 * an item deleted from the corpus disappears from the database, which an upsert
 * loop would silently leave behind.
 *
 * Run with: pnpm knowledge:ingest
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(here, "../../../knowledge/knowledge-corpus.json");

type CorpusItem = {
  id: string;
  domain: string;
  category: string;
  topic: string;
  subtopic: string | null;
  knowledgeType: string;
  claimType: string;
  title: string;
  principle: string;
  explanation: string;
  whyItMatters: string;
  recommendedAction: string;
  limitations: string;
  appliesWhen: string[];
  doesNotApplyWhen: string[];
  relatedIssues: string[];
  relatedKnowledge: string[];
  checks: string[];
  applicability: string[];
  entities: string[];
  tags: string[];
  evidenceType: string;
  evidenceStrength: string;
  confidence: string;
  source: {
    name: string;
    publisher: string;
    url: string | null;
    type: string;
    location: string | null;
    quote: string | null;
    localPath: string | null;
  };
  provenance: { verifiedAgainstLocalSource: boolean; sourceSupport: string };
  status: string;
  supersededBy?: string;
  governingPolicies?: string[];
  version: string;
  lastVerified: string;
  reviewBy: string;
};

type CorpusPolicy = {
  id: string;
  question: string;
  decision: string;
  rationale: string;
  directive: string;
  neverSay: string[];
  losingClaim: string;
  caveat?: string;
  appliesToItems: string[];
  appliesToChecks: string[];
  confidence: string;
};

type Corpus = {
  generated: string;
  schemaVersion: string;
  items: CorpusItem[];
  policies: CorpusPolicy[];
};

export async function ingestKnowledge(corpusPath = CORPUS_PATH): Promise<{
  items: number;
  policies: number;
  skipped: number;
  corpusVersion: string;
}> {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as Corpus;
  const corpusVersion = `${corpus.schemaVersion}+${corpus.generated}`;

  // Superseded and unverified items are never loaded. Retrieval filters on
  // status too, but keeping them out of the table entirely means a future query
  // that forgets the filter still cannot surface them.
  const usable = corpus.items.filter(
    (item) => item.status === "active" || item.status === "revised",
  );
  const skipped = corpus.items.length - usable.length;

  const itemRows = usable.map((item) => ({
    id: item.id,
    domain: item.domain,
    category: item.category,
    topic: item.topic,
    subtopic: item.subtopic,
    knowledgeType: item.knowledgeType,
    claimType: item.claimType,
    title: item.title,
    principle: item.principle,
    explanation: item.explanation,
    whyItMatters: item.whyItMatters,
    recommendedAction: item.recommendedAction,
    limitations: item.limitations,
    appliesWhen: item.appliesWhen,
    doesNotApplyWhen: item.doesNotApplyWhen,
    relatedIssues: item.relatedIssues,
    relatedKnowledge: item.relatedKnowledge,
    checks: item.checks,
    applicability: item.applicability,
    entities: item.entities,
    tags: item.tags,
    pageTypes: [] as string[],
    evidenceType: item.evidenceType,
    evidenceStrength: item.evidenceStrength,
    confidence: item.confidence,
    sourceName: item.source.name,
    sourcePublisher: item.source.publisher,
    sourceUrl: item.source.url,
    sourceType: item.source.type,
    sourceLocation: item.source.location,
    sourceQuote: item.source.quote,
    sourceLocalPath: item.source.localPath,
    verified: item.provenance.verifiedAgainstLocalSource,
    sourceSupport: item.provenance.sourceSupport,
    status: item.status,
    supersededBy: item.supersededBy ?? null,
    governingPolicies: item.governingPolicies ?? [],
    version: item.version,
    lastVerified: item.lastVerified,
    reviewBy: item.reviewBy,
    corpusVersion,
  }));

  const policyRows = corpus.policies.map((policy) => ({
    id: policy.id,
    question: policy.question,
    decision: policy.decision,
    rationale: policy.rationale,
    directive: policy.directive,
    neverSay: policy.neverSay,
    losingClaim: policy.losingClaim,
    caveat: policy.caveat ?? null,
    appliesToItems: policy.appliesToItems,
    appliesToChecks: policy.appliesToChecks,
    confidence: policy.confidence,
    corpusVersion,
  }));

  await prisma.$transaction([
    prisma.knowledgeItem.deleteMany(),
    prisma.knowledgePolicy.deleteMany(),
    prisma.knowledgePolicy.createMany({ data: policyRows }),
    prisma.knowledgeItem.createMany({ data: itemRows }),
  ]);

  return {
    items: itemRows.length,
    policies: policyRows.length,
    skipped,
    corpusVersion,
  };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  ingestKnowledge()
    .then((result) => {
      console.log(
        `Knowledge ingested: ${result.items} items, ${result.policies} policies ` +
          `(${result.skipped} skipped as superseded/unverified) at ${result.corpusVersion}`,
      );
      return prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error("Knowledge ingestion failed:", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
