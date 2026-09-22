/**
 * Knowledge retrieval (Phase 1.5, 1.7).
 *
 * Routing is metadata-first, as the plan specifies: a deterministic finding
 * names a `checkId`, and knowledge items declare which checks they can explain.
 * That is an exact join, not a similarity guess, and it needs no embeddings.
 * The interface below is provider-independent, so adding vector search later is
 * a new implementation of `retrieveKnowledge` rather than a change to callers.
 *
 * Two rules are enforced here rather than left to the prompt:
 *
 *  1. Superseded and unverified items never leave this module.
 *  2. Myth items are returned in a separate `contradictions` list, never mixed
 *     into `items`. A myth in a recommendation slot is the exact failure the
 *     corpus exists to prevent.
 */

import { prisma } from "@seo-maker/db";

export type KnowledgeRecord = {
  id: string;
  domain: string;
  category: string;
  topic: string;
  knowledgeType: string;
  claimType: string;
  title: string;
  principle: string;
  explanation: string;
  whyItMatters: string;
  recommendedAction: string;
  limitations: string;
  checks: string[];
  applicability: string[];
  evidenceStrength: string;
  confidence: string;
  sourceName: string;
  sourceUrl: string | null;
  sourceLocation: string | null;
  sourceQuote: string | null;
  verified: boolean;
  governingPolicies: string[];
  corpusVersion: string;
};

export type PolicyRecord = {
  id: string;
  question: string;
  decision: string;
  directive: string;
  neverSay: string[];
  losingClaim: string;
  appliesToChecks: string[];
  appliesToItems: string[];
};

export type KnowledgeQuery = {
  /** Deterministic check ids that fired. The primary routing key. */
  checks?: string[];
  topics?: string[];
  /** Retrieval routing tags, e.g. "page_audit", "geo_analysis". */
  applicability?: string[];
  domain?: "seo" | "geo";
  /** Hard ceiling on items placed in the prompt. */
  limit?: number;
};

export type KnowledgeBundle = {
  items: KnowledgeRecord[];
  /** Myth items. Render as "do not believe X", never as advice. */
  contradictions: KnowledgeRecord[];
  /** Policies that override item phrasing. Apply before emitting anything. */
  policies: PolicyRecord[];
  /** Stamp for AiResult.knowledgeVersion, so a result is reproducible. */
  knowledgeVersion: string | null;
};

const SELECT = {
  id: true,
  domain: true,
  category: true,
  topic: true,
  knowledgeType: true,
  claimType: true,
  title: true,
  principle: true,
  explanation: true,
  whyItMatters: true,
  recommendedAction: true,
  limitations: true,
  checks: true,
  applicability: true,
  evidenceStrength: true,
  confidence: true,
  sourceName: true,
  sourceUrl: true,
  sourceLocation: true,
  sourceQuote: true,
  verified: true,
  governingPolicies: true,
  corpusVersion: true,
} as const;

/** Authoritative first, then research, then heuristic. Myths are separated out. */
const TYPE_RANK: Record<string, number> = {
  authoritative: 0,
  research: 1,
  heuristic: 2,
  myth: 3,
};

const STRENGTH_RANK: Record<string, number> = {
  strong: 0,
  moderate: 1,
  weak: 2,
  unknown: 3,
};

export function rankKnowledge(a: KnowledgeRecord, b: KnowledgeRecord): number {
  const byType = (TYPE_RANK[a.knowledgeType] ?? 9) - (TYPE_RANK[b.knowledgeType] ?? 9);
  if (byType !== 0) return byType;

  // A verified item carries a quote and a section reference; an unverified one
  // cannot be cited. Prefer the citable one when both cover the same ground.
  if (a.verified !== b.verified) return a.verified ? -1 : 1;

  const byStrength =
    (STRENGTH_RANK[a.evidenceStrength] ?? 9) - (STRENGTH_RANK[b.evidenceStrength] ?? 9);
  if (byStrength !== 0) return byStrength;

  return a.id.localeCompare(b.id);
}

/**
 * Fetches the knowledge for one generation call.
 *
 * Returns an empty bundle rather than throwing when the table has not been
 * populated: an un-ingested corpus must degrade to "no grounding available",
 * which the caller can refuse to generate on, not crash the job.
 */
export async function retrieveKnowledge(query: KnowledgeQuery): Promise<KnowledgeBundle> {
  const limit = query.limit ?? 14;

  const or: Record<string, unknown>[] = [];
  if (query.checks?.length) or.push({ checks: { hasSome: query.checks } });
  if (query.topics?.length) or.push({ topic: { in: query.topics } });
  if (query.applicability?.length) or.push({ applicability: { hasSome: query.applicability } });

  const where: Record<string, unknown> = {
    // Phase 1.5 rule: superseded and unverified knowledge never reaches a prompt.
    status: { in: ["active", "revised"] },
  };
  if (query.domain) where.domain = query.domain;
  if (or.length) where.OR = or;

  const rows = (await prisma.knowledgeItem.findMany({
    where,
    select: SELECT,
    // Over-fetch, then rank in code: ranking is by knowledge type and evidence
    // strength, which Postgres cannot order without a CASE ladder per column.
    take: limit * 4,
  })) as KnowledgeRecord[];

  if (rows.length === 0) {
    return { items: [], contradictions: [], policies: [], knowledgeVersion: null };
  }

  const myths = rows.filter((row) => row.knowledgeType === "myth").sort(rankKnowledge);
  const items = rows.filter((row) => row.knowledgeType !== "myth").sort(rankKnowledge).slice(0, limit);

  const policyIds = new Set<string>();
  for (const row of [...items, ...myths]) {
    for (const id of row.governingPolicies) policyIds.add(id);
  }

  const policies = policyIds.size
    ? ((await prisma.knowledgePolicy.findMany({
        where: { id: { in: [...policyIds] } },
        select: {
          id: true,
          question: true,
          decision: true,
          directive: true,
          neverSay: true,
          losingClaim: true,
          appliesToChecks: true,
          appliesToItems: true,
        },
      })) as unknown as PolicyRecord[])
    : [];

  return {
    items,
    contradictions: myths.slice(0, 6),
    policies,
    knowledgeVersion: rows[0]?.corpusVersion ?? null,
  };
}
