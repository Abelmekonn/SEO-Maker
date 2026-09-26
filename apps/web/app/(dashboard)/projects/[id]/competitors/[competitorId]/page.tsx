import {
  buildCompetitorComparison,
  getCompetitorSearchEvidence,
  loadSiteIntelligence,
  readPageRaw,
  saveComparison,
} from "@seo-maker/ai";
import { competitorInsightSchema } from "@seo-maker/ai/schemas";
import { type CompetitorComparison, competitorPolicy, describeCompetitorFindings } from "@seo-maker/core/competitors";
import { type SeoDimensionId, readStoredConfidence, weightedSeoScore } from "@seo-maker/core/scoring";
import { prisma } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { CompetitorDetail } from "@/components/project/CompetitorDetail";
import { CompetitorGaps } from "@/components/project/CompetitorGaps";
import { CompetitorInsightButton } from "@/components/project/CompetitorInsightButton";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { premiumGate } from "@/components/project/PremiumRoute";
import { aiConfigured } from "@/lib/ai-results";
import { getCompetitorForUser } from "@/lib/competitors";
import { getAccountForUser } from "@/lib/plan";
import { latestPagesForProject, requireUserId } from "@/lib/projects";
import { getAiCompetitorJobs } from "@/lib/queue";

const TABS = ["overview", "rankings", "pages", "content", "gaps", "compare"] as const;
type TabId = (typeof TABS)[number];

function readTab(value: string | undefined): TabId {
  return TABS.includes(value as TabId) ? (value as TabId) : "overview";
}

function readComparison(value: unknown): CompetitorComparison | null {
  const raw = value as Partial<CompetitorComparison> | null;
  return raw && Array.isArray(raw.facts) && Array.isArray(raw.limits) ? (raw as CompetitorComparison) : null;
}

function readNotMeasured(value: unknown): SeoDimensionId[] {
  return Array.isArray(value) ? (value.filter((v) => typeof v === "string") as SeoDimensionId[]) : [];
}

export default async function CompetitorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; competitorId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id, competitorId } = await params;
  const gate = await premiumGate(id, "competitors");
  if (gate) {
    return gate;
  }
  const { tab } = await searchParams;

  const competitor = await getCompetitorForUser(id, competitorId, userId);
  if (!competitor) {
    notFound();
  }

  const policy = competitorPolicy();
  const [pages, selfPages, search] = await Promise.all([
    prisma.competitorPage.findMany({
      where: { competitorId: competitor.id },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    latestPagesForProject(id),
    // What is stored; nothing is fetched while the page renders.
    getCompetitorSearchEvidence({
      projectId: id,
      competitorDomain: competitor.domain,
      refresh: false,
      ttlHours: policy.serpTtlHours,
      depth: policy.serpDepth,
    }),
  ]);

  const analysis = competitor.analyses[0] ?? null;
  const self = weightedSeoScore({ pages: selfPages });

  // The comparison is stored with each analysis (Phase 4.1). One made before
  // comparisons existed is built now, once, and stored.
  let comparison = readComparison(analysis?.comparison);
  if (!comparison && analysis && competitor.status === "ready") {
    const loaded = await loadSiteIntelligence(id);
    if (loaded) {
      comparison = await buildCompetitorComparison(competitor, loaded);
      await saveComparison(competitor.id, comparison);
    }
  }
  const [insightRow, insightJobs, account] = await Promise.all([
    prisma.aiResult.findFirst({
      where: { competitorId: competitor.id, feature: "competitor-insight" },
      orderBy: { createdAt: "desc" },
      select: { status: true, output: true, model: true, provider: true, createdAt: true },
    }),
    getAiCompetitorJobs(id).catch(() => []),
    getAccountForUser(userId),
  ]);
  const parsedInsight = insightRow?.status === "ok" ? competitorInsightSchema.safeParse(insightRow.output) : null;
  const insight = parsedInsight?.success ? parsedInsight.data : null;
  const explaining = insightJobs.some((job) => !job.data.competitorId || job.data.competitorId === competitor.id);
  const insightDisabled = !account.limits.competitorAi
    ? `${account.limits.label} does not include Competitor AI.`
    : !aiConfigured()
      ? "AI is not available right now. Try again later."
      : explaining
        ? "Interpreting now. This page updates when it is ready."
        : !comparison || comparison.facts.length === 0
          ? "There are no observed differences to interpret yet."
          : undefined;

  const findings = describeCompetitorFindings({
    domain: competitor.domain,
    search: search.summary,
    pages: pages.map((page) => ({
      url: page.url,
      pageType: page.pageType,
      indexable: page.indexable,
      schemaTypes: Array.isArray(page.schema) ? page.schema.filter((type): type is string => typeof type === "string") : [],
    })),
    comparison,
  });
  const summary = search.summary;
  const searchNote =
    search.unavailableReason ??
    (summary && summary.appearanceCount === 0 ? `${competitor.domain} did not appear in any of the ${summary.queriesChecked} searches checked.` : null);

  return (
    <>
      <CrawlRefresh status={competitor.status} intervalMs={3000} />
      <CrawlRefresh status={explaining ? "running" : "idle"} intervalMs={4000} />
      <CompetitorDetail
        projectId={id}
        competitorId={competitor.id}
        domain={competitor.domain}
        name={competitor.name}
        status={competitor.status}
        statusError={competitor.statusError}
        initialTab={readTab(tab)}
        confidence={competitor.confidence}
        confidenceBand={competitor.confidenceBand}
        confidenceBreakdown={readStoredConfidence(analysis?.confidenceParts)}
        findings={findings}
        searchNote={searchNote}
        seoScore={competitor.seoScore}
        dimensions={{
          technical: analysis?.technicalScore ?? null,
          onPage: analysis?.onPageScore ?? null,
          content: analysis?.contentScore ?? null,
          performance: analysis?.performanceScore ?? null,
          internalLinks: analysis?.internalLinksScore ?? null,
          structuredData: analysis?.structuredDataScore ?? null,
        }}
        notMeasured={readNotMeasured(analysis?.notMeasured)}
        selfSeoScore={self.score}
        selfDimensions={self.dimensions}
        selfNotMeasured={self.notMeasured}
        pages={pages.map((page) => ({
          id: page.id,
          url: page.url,
          title: page.title,
          h1: page.h1,
          wordCount: page.wordCount,
          internalLinks: page.internalLinks,
          schemaCount: page.schemaCount,
          statusCode: page.statusCode,
          seoScore: page.seoScore,
          selectionReason: readPageRaw(page.rawData).selection?.reason ?? null,
        }))}
        queries={(summary?.rows ?? []).map((row) => ({
          query: row.query,
          position: row.position,
          url: row.url,
          selfPosition: row.selfPosition,
        }))}
        summary={analysis?.summary ?? null}
        gapsPanel={
          <CompetitorGaps
            domain={competitor.domain}
            comparison={comparison}
            insight={insight}
            insightMeta={insightRow && insight ? `${insightRow.provider} / ${insightRow.model} · ${insightRow.createdAt.toLocaleString("en-GB")}` : null}
            action={
              <CompetitorInsightButton
                projectId={id}
                competitorId={competitor.id}
                label={insight ? "Re-interpret with AI" : "Interpret with AI"}
                disabledReason={insightDisabled}
                force={Boolean(insight)}
              />
            }
          />
        }
        lastAnalyzedAt={
          competitor.lastAnalyzedAt ? competitor.lastAnalyzedAt.toLocaleString() : null
        }
      />
    </>
  );
}
