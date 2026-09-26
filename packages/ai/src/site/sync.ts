/**
 * Stores site opportunities (Phase 3.3, 4.7).
 *
 * Deterministic and cheap: no model is called here. The crawl worker runs it
 * after every crawl, so opportunities always describe the latest crawl, and a
 * condition a later crawl no longer finds is stamped `resolvedAt` rather than
 * deleted, which is what the re-crawl comparison reads.
 *
 * Rows are keyed by the engine's stable key ("check:meta"), so re-deriving
 * updates a row in place and keeps the user's status on it. AI wording is kept
 * only while the facts it was written against are unchanged: "12 pages lack a
 * description" must not survive a crawl that found 3.
 */

import { createHash } from "node:crypto";
import { type SiteOpportunityCandidate, deriveSiteOpportunities } from "@seo-maker/core/site";
import { Prisma, prisma } from "@seo-maker/db";
import { type LoadedSite, loadSiteIntelligence } from "../context/site";
import type { SiteOpportunity } from "../schemas";

export type OpportunityEvidence = {
  facts: string[];
  /** Hash of the facts the current wording was written against. */
  factsHash: string;
  checks: string[];
  links?: SiteOpportunityCandidate["links"];
  /** The AI's one-sentence restatement of the facts, when AI has run. */
  statement?: string;
};

export type SiteSync = {
  loaded: LoadedSite;
  candidates: SiteOpportunityCandidate[];
  created: number;
  updated: number;
  resolved: number;
};

export function factsHash(candidate: SiteOpportunityCandidate): string {
  return createHash("sha256")
    .update(JSON.stringify([candidate.title, candidate.facts, candidate.affectedCount]))
    .digest("hex")
    .slice(0, 16);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function syncSiteOpportunities(projectId: string): Promise<SiteSync | null> {
  const loaded = await loadSiteIntelligence(projectId);
  if (!loaded) return null;
  const candidates = deriveSiteOpportunities(loaded.intel);

  const existing = await prisma.opportunity.findMany({
    where: { projectId, source: "site" },
    select: { id: true, key: true, evidence: true, aiUsed: true, resolvedAt: true },
  });
  const byKey = new Map(existing.flatMap((row) => (row.key ? [[row.key, row]] : [])));

  let created = 0;
  let updated = 0;
  for (const candidate of candidates) {
    const hash = factsHash(candidate);
    const evidence: OpportunityEvidence = {
      facts: candidate.facts,
      factsHash: hash,
      checks: candidate.checks,
      ...(candidate.links ? { links: candidate.links } : {}),
    };
    const measured = {
      category: candidate.category,
      score: candidate.priority.score,
      band: candidate.priority.band,
      parts: {
        parts: candidate.priority.parts,
        weights: candidate.priority.weights,
        notMeasured: candidate.priority.notMeasured,
      } as unknown as Prisma.InputJsonValue,
      effort: candidate.effort,
      confidence: candidate.confidence,
      affectedUrls: candidate.affected as unknown as Prisma.InputJsonValue,
      affectedCount: candidate.affectedCount,
      crawlId: loaded.crawlId,
      resolvedAt: null,
    };
    const wording = {
      title: candidate.title,
      rationale: candidate.rationale,
      action: candidate.action,
      nextStep: null,
      aiUsed: false,
      aiResultId: null,
    };

    const row = byKey.get(candidate.key);
    const previous = row?.evidence as Partial<OpportunityEvidence> | null | undefined;
    const keepWording = Boolean(row?.aiUsed && previous?.factsHash === hash);
    const update = {
      ...measured,
      ...(keepWording
        ? { evidence: { ...evidence, statement: previous?.statement } as Prisma.InputJsonValue }
        : { ...wording, evidence: evidence as unknown as Prisma.InputJsonValue }),
      // A condition that comes back after being resolved starts a new baseline.
      ...(row?.resolvedAt ? { baselineCount: candidate.affectedCount, baselineCrawlId: loaded.crawlId } : {}),
    };

    if (row) {
      await prisma.opportunity.update({ where: { id: row.id }, data: update });
      updated += 1;
      continue;
    }
    try {
      await prisma.opportunity.create({
        data: {
          projectId,
          key: candidate.key,
          source: "site",
          ...measured,
          ...wording,
          evidence: evidence as unknown as Prisma.InputJsonValue,
          baselineCount: candidate.affectedCount,
          baselineCrawlId: loaded.crawlId,
        },
      });
      created += 1;
    } catch (error) {
      // Another sync (the crawl worker and a page render) created it first.
      if (!isUniqueViolation(error)) throw error;
      await prisma.opportunity.update({ where: { projectId_key: { projectId, key: candidate.key } }, data: update });
      updated += 1;
    }
  }

  const current = new Set(candidates.map((candidate) => candidate.key));
  const gone = existing.filter((row) => row.key && !current.has(row.key) && !row.resolvedAt);
  if (gone.length > 0) {
    await prisma.opportunity.updateMany({
      where: { id: { in: gone.map((row) => row.id) } },
      data: { resolvedAt: new Date(), affectedCount: 0, crawlId: loaded.crawlId },
    });
  }

  return { loaded, candidates, created, updated, resolved: gone.length };
}

/**
 * Applies AI wording to the opportunities it was written for.
 *
 * Only where the stored facts still match the ones sent: if a crawl finished
 * while the model was writing, its words describe facts that no longer hold,
 * and the deterministic wording stays.
 */
export async function applySiteOpportunityWording(input: {
  projectId: string;
  output: SiteOpportunity;
  aiResultId: string;
  sent: SiteOpportunityCandidate[];
}): Promise<number> {
  const sentHash = new Map(input.sent.map((candidate) => [candidate.key, factsHash(candidate)]));
  let applied = 0;
  for (const row of input.output.opportunities) {
    const stored = await prisma.opportunity.findUnique({
      where: { projectId_key: { projectId: input.projectId, key: row.id } },
      select: { id: true, evidence: true },
    });
    const evidence = stored?.evidence as OpportunityEvidence | null | undefined;
    if (!stored || !evidence || evidence.factsHash !== sentHash.get(row.id)) continue;
    await prisma.opportunity.update({
      where: { id: stored.id },
      data: {
        title: row.title,
        rationale: row.rationale,
        action: row.action,
        nextStep: row.nextStep,
        evidence: { ...evidence, statement: row.evidence } as unknown as Prisma.InputJsonValue,
        aiUsed: true,
        aiResultId: input.aiResultId,
      },
    });
    applied += 1;
  }
  return applied;
}
