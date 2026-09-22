import { type SeoDimensionId, weightedSeoScore } from "@seo-maker/core/scoring";
import { prisma } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { CompetitorDetail } from "@/components/project/CompetitorDetail";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { getCompetitorForUser, serpConfigured } from "@/lib/competitors";
import { latestPagesForProject, requireUserId } from "@/lib/projects";

const TABS = ["overview", "rankings", "pages", "content", "gaps", "compare"] as const;
type TabId = (typeof TABS)[number];

function readTab(value: string | undefined): TabId {
  return TABS.includes(value as TabId) ? (value as TabId) : "overview";
}

function readParts(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, { raw: number; weight: number; points: number }>;
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
  const { tab } = await searchParams;

  const competitor = await getCompetitorForUser(id, competitorId, userId);
  if (!competitor) {
    notFound();
  }

  const [pages, selfPages, serpRows, totalQueries] = await Promise.all([
    prisma.competitorPage.findMany({
      where: { competitorId: competitor.id },
      orderBy: { wordCount: "desc" },
      take: 100,
    }),
    latestPagesForProject(id),
    prisma.serpResult.findMany({
      where: { domain: competitor.domain, query: { projectId: id } },
      include: { query: true },
      orderBy: { position: "asc" },
      take: 50,
    }),
    prisma.competitorQuery.count({ where: { projectId: id } }),
  ]);

  const analysis = competitor.analyses[0] ?? null;
  const self = weightedSeoScore({ pages: selfPages });

  return (
    <>
      <CrawlRefresh status={competitor.status} intervalMs={3000} />
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
        confidenceParts={readParts(analysis?.confidenceParts)}
        sharedQueries={new Set(serpRows.map((row) => row.queryId)).size}
        totalQueries={totalQueries}
        avgPosition={competitor.avgPosition}
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
        }))}
        queries={serpRows.map((row) => ({
          query: row.query.query,
          position: row.position,
          url: row.url,
          selfPosition: row.query.selfPosition,
        }))}
        summary={analysis?.summary ?? null}
        providerConfigured={serpConfigured()}
        lastAnalyzedAt={
          competitor.lastAnalyzedAt ? competitor.lastAnalyzedAt.toLocaleString() : null
        }
      />
    </>
  );
}
