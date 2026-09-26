/**
 * The project's search queries: generated once from the business profile,
 * stored as CompetitorQuery rows, and reused.
 *
 * `generateSearchQueries` is the one entry point, for both the "Generate
 * Search Keywords" action and automatic discovery. The AI answer is cached
 * by its input (profile, market, prompt version, model), so running
 * discovery again on an unchanged profile spends no tokens; regenerating
 * asks for a fresh answer.
 */

import { type GeneratedSearchQuery, type ProfileGap, scoreQueryRelevance } from "@seo-maker/core/competitors";
import { type CompetitorQuery, prisma } from "@seo-maker/db";
import type { AiError } from "../provider";
import { planForProject } from "../context/site";
import { searchQueriesSpec } from "../features/search-queries";
import { runAiFeature } from "../index";
import { type ProjectSearchContext, type SearchMarket, loadProjectSearchContext } from "./context";

export const RETIRED = "retired";

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Active queries for a market, most important first. */
export async function activeSearchQueries(projectId: string, market: Pick<SearchMarket, "locationCode" | "languageCode">): Promise<CompetitorQuery[]> {
  const rows = await prisma.competitorQuery.findMany({
    where: { projectId, status: { not: RETIRED }, locationCode: market.locationCode, languageCode: market.languageCode },
    orderBy: { createdAt: "asc" },
  });
  return rows.sort((a, b) => (PRIORITY_ORDER[a.priority ?? "medium"] ?? 1) - (PRIORITY_ORDER[b.priority ?? "medium"] ?? 1));
}

/**
 * Stores a generated set as the project's searches for its market.
 *
 * Idempotent: a query already stored keeps its row and its search results.
 * Generated queries no longer in the set are retired, or deleted when they
 * were never checked, so the active set is exactly what was generated.
 */
export async function saveGeneratedQueries(
  context: ProjectSearchContext,
  market: SearchMarket,
  queries: GeneratedSearchQuery[],
): Promise<CompetitorQuery[]> {
  const projectId = context.project.id;
  const kept: string[] = [];
  for (const row of queries) {
    const relevance = scoreQueryRelevance(row.query, context.businessTerms);
    const saved = await prisma.competitorQuery.upsert({
      where: {
        projectId_query_locationCode_languageCode: {
          projectId,
          query: row.query,
          locationCode: market.locationCode,
          languageCode: market.languageCode,
        },
      },
      create: {
        projectId,
        query: row.query,
        source: "ai",
        intent: row.intent,
        priority: row.priority,
        reason: row.reason,
        relevance,
        locationCode: market.locationCode,
        languageCode: market.languageCode,
        status: "pending",
      },
      update: { intent: row.intent, priority: row.priority, reason: row.reason, relevance },
    });
    if (saved.status === RETIRED) {
      await prisma.competitorQuery.update({ where: { id: saved.id }, data: { status: saved.checkedAt ? "fetched" : "pending" } });
    }
    kept.push(saved.id);
  }

  const stale = await prisma.competitorQuery.findMany({
    where: { projectId, source: "ai", id: { notIn: kept }, status: { not: RETIRED } },
    select: { id: true, checkedAt: true },
  });
  const neverChecked = stale.filter((row) => !row.checkedAt).map((row) => row.id);
  const checked = stale.filter((row) => row.checkedAt).map((row) => row.id);
  if (neverChecked.length) await prisma.competitorQuery.deleteMany({ where: { id: { in: neverChecked } } });
  if (checked.length) await prisma.competitorQuery.updateMany({ where: { id: { in: checked } }, data: { status: RETIRED } });

  return activeSearchQueries(projectId, market);
}

/**
 * The user's own target keywords as searches, when nothing was generated:
 * lets a manually added competitor be checked against real searches without
 * any AI. Only for a project with a market to search in.
 */
export async function ensureKeywordQueries(context: ProjectSearchContext): Promise<CompetitorQuery[]> {
  const market = context.searchMarket;
  if (!market) return [];
  const keywords = [...new Set(context.self.targetKeywords.map((keyword) => keyword.trim().toLowerCase()).filter((keyword) => keyword.split(/\s+/).length >= 2))].slice(0, 12);
  for (const query of keywords) {
    await prisma.competitorQuery.upsert({
      where: {
        projectId_query_locationCode_languageCode: {
          projectId: context.project.id,
          query,
          locationCode: market.locationCode,
          languageCode: market.languageCode,
        },
      },
      create: {
        projectId: context.project.id,
        query,
        source: "manual",
        intent: "commercial",
        priority: "medium",
        reason: "One of your target keywords.",
        relevance: scoreQueryRelevance(query, context.businessTerms),
        locationCode: market.locationCode,
        languageCode: market.languageCode,
      },
      update: {},
    });
  }
  return activeSearchQueries(context.project.id, market);
}

export type GenerateQueriesResult =
  | { status: "ok"; queries: CompetitorQuery[]; cached: boolean; context: ProjectSearchContext }
  | { status: "profile-required"; gaps: ProfileGap[] }
  | { status: "failed"; error: AiError | null; message: string };

/**
 * Generates (or reuses) the project's search queries and stores them.
 *
 * Refuses without a complete business profile: guessing searches for a
 * business SEO Maker does not understand would make every measurement
 * built on them meaningless.
 */
export async function generateSearchQueries(input: {
  projectId: string;
  /** Ask for a fresh answer instead of the cached one: "Regenerate". */
  force?: boolean;
  signal?: AbortSignal;
}): Promise<GenerateQueriesResult> {
  const context = await loadProjectSearchContext(input.projectId);
  if (!context) return { status: "failed", error: null, message: "Project not found." };
  if (context.gaps.length > 0 || !context.searchMarket) {
    return { status: "profile-required", gaps: context.gaps };
  }
  const market = context.searchMarket;

  const spec = searchQueriesSpec(
    {
      site: { name: context.project.name, domain: context.selfDomain, language: market.languageCode },
      business: {
        name: context.project.businessName,
        type: context.project.businessType,
        industry: context.project.industry,
        description: context.project.businessDescription,
        audience: context.project.targetAudience,
        servicesProducts: context.self.offerings,
        primaryGoal: context.project.primaryGoal,
        targetKeywords: context.self.targetKeywords,
      },
      market: { scope: market.scope, country: market.country.name, location: context.market.label },
      pages: context.pages,
    },
    context.brandTerms,
  );

  const result = await runAiFeature({
    feature: spec.feature,
    mode: "deep",
    schema: spec.schema,
    projectId: context.project.id,
    plan: await planForProject(context.project.id),
    force: input.force,
    evidence: spec.evidence,
    buildPrompt: () => spec.buildPrompt(""),
    refine: spec.refine,
    maxTokens: spec.maxTokens,
    temperature: spec.temperature,
    signal: input.signal,
  });
  if (result.status === "failed") {
    return { status: "failed", error: result.error, message: result.error.message };
  }

  const queries = await saveGeneratedQueries(context, market, result.data.queries as GeneratedSearchQuery[]);
  return { status: "ok", queries, cached: result.cached, context };
}
