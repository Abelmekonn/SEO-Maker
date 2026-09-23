import { deriveCompetitorView } from "@seo-maker/core/competitors";
import { type SeoDimensionId, weightedSeoScore } from "@seo-maker/core/scoring";
import { prisma, readCompetitorProgress } from "@seo-maker/db";
import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CompetitorAddForm } from "@/components/project/CompetitorAddForm";
import { CompetitorConfidencePanel } from "@/components/project/CompetitorConfidencePanel";
import { CompetitorDiscoveryStatus } from "@/components/project/CompetitorDiscoveryStatus";
import { CompetitorEmptyState } from "@/components/project/CompetitorEmptyState";
import { CompetitorFeatured } from "@/components/project/CompetitorFeatured";
import {
  type ComparisonColumn,
  CompetitorSeoComparison,
} from "@/components/project/CompetitorSeoComparison";
import { CompetitorStatCards } from "@/components/project/CompetitorStatCards";
import { CompetitorTable } from "@/components/project/CompetitorTable";
import { ContentOpportunities } from "@/components/project/ContentOpportunities";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { getCompetitorsForProject, serpConfigured } from "@/lib/competitors";
import { formatRelativeRun } from "@/lib/performance";
import { premiumGate } from "@/components/project/PremiumRoute";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { normalizeSiteUrl } from "@/lib/site-url";

function readParts(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, { raw: number; weight: number; points: number }>;
}

export default async function ProjectCompetitorsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }

  const gate = await premiumGate(project.id, "competitors");
  if (gate) {
    return gate;
  }

  const [account, competitors, progress, totalQueries, allDomains, opportunities] =
    await Promise.all([
      getAccountForUser(userId),
      getCompetitorsForProject(project.id),
      readCompetitorProgress(prisma, project.id),
      prisma.competitorQuery.count({ where: { projectId: project.id } }),
      prisma.competitor.count({ where: { projectId: project.id } }),
      prisma.opportunity.findMany({
        where: { projectId: project.id, status: { not: "dismissed" } },
        orderBy: { score: "desc" },
        take: 8,
        include: { gap: true },
      }),
    ]);

  const analyses = await prisma.competitorAnalysis.findMany({
    where: { competitorId: { in: competitors.map((row) => row.id) } },
    orderBy: { createdAt: "desc" },
  });
  const latestAnalysis = new Map<string, (typeof analyses)[number]>();
  for (const analysis of analyses) {
    if (!latestAnalysis.has(analysis.competitorId)) {
      latestAnalysis.set(analysis.competitorId, analysis);
    }
  }

  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;
  const providerConfigured = serpConfigured();
  const planAllows = account.limits.maxCompetitors > 0;

  const ready = competitors.filter((row) => row.status === "ready");
  const view = deriveCompetitorView({
    compStatus: progress.compStatus,
    compError: progress.compError,
    providerConfigured,
    competitorCount: competitors.length,
    readyCount: ready.length,
    failedCount: competitors.filter((row) => row.status === "failed").length,
  });

  const rowActive = competitors.some((row) =>
    ["queued", "crawling", "analyzing"].includes(row.status),
  );
  const pollStatus = rowActive ? "running" : progress.compStatus;

  const self = weightedSeoScore({ pages: project.pages });
  const featured =
    [...ready].sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1))[0] ?? null;
  const featuredAnalysis = featured ? (latestAnalysis.get(featured.id) ?? null) : null;

  const comparisonColumns: ComparisonColumn[] = [
    { id: "self", label: "Your site", isSelf: true, dimensions: self.dimensions },
    ...ready.slice(0, 3).map((row) => {
      const analysis = latestAnalysis.get(row.id);
      return {
        id: row.id,
        label: row.domain,
        isSelf: false,
        dimensions: {
          technical: analysis?.technicalScore ?? null,
          onPage: analysis?.onPageScore ?? null,
          content: analysis?.contentScore ?? null,
          performance: analysis?.performanceScore ?? null,
          internalLinks: analysis?.internalLinksScore ?? null,
          structuredData: analysis?.structuredDataScore ?? null,
        } satisfies Partial<Record<SeoDimensionId, number | null>>,
      };
    }),
  ];

  const showDashboard = competitors.length > 0;
  const lastAnalysisLabel = progress.compRunAt
    ? formatRelativeRun(new Date(progress.compRunAt))
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
        <Link href="/dashboard" className="hover:text-ink">
          Projects
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <Link href={`/projects/${project.id}`} className="hover:text-ink">
          {hostname}
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span className="text-ink">Competitors</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[30px] leading-none tracking-[-0.8px] text-ink">
              Competitors
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 font-mono text-[11px] leading-4 text-primary">
              <Sparkles className="size-3" aria-hidden />
              AI-powered
            </span>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-body">
            Discover who competes with you in search, compare their strengths and weaknesses, and
            find new opportunities to grow your visibility.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex flex-col rounded-lg bg-surface-soft px-3 py-1.5 ring-1 ring-hairline">
            <span className="font-mono text-[10px] text-muted-soft">Last analysis</span>
            <span className="font-mono text-[12px] text-ink">
              {lastAnalysisLabel ?? "Never"}
            </span>
          </span>
        </div>
      </header>

      <CrawlRefresh status={pollStatus} intervalMs={3000} />

      <CompetitorDiscoveryStatus
        status={progress.compStatus}
        phase={progress.compPhase}
        error={progress.compError}
        done={progress.compDone}
        total={progress.compTotal}
        phaseDone={progress.compPhaseDone}
        phaseTotal={progress.compPhaseTotal}
      />

      <CompetitorStatCards
        searchesAnalyzed={totalQueries}
        domainsDiscovered={allDomains}
        strongCompetitors={competitors.filter((row) => (row.confidence ?? 0) >= 75).length}
        lastAnalysis={lastAnalysisLabel}
        discoveryRun={progress.compStatus !== "idle"}
      />

      {view.state === "not-analyzed" ||
      view.state === "no-results" ||
      view.state === "no-provider" ? (
        <CompetitorEmptyState state={view.state} />
      ) : null}

      {showDashboard ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)]">
          <CompetitorTable
            projectId={project.id}
            rows={competitors.map((row) => ({
              id: row.id,
              domain: row.domain,
              name: row.name,
              source: row.source,
              status: row.status,
              statusError: row.statusError,
              confidence: row.confidence,
              confidenceBand: row.confidenceBand,
              seoScore: row.seoScore,
              pageCount: row.pageCount,
              queryCount: row.queryCount,
              topQueryCount: row.topQueryCount,
              avgPosition: row.avgPosition,
              pinned: row.pinned,
              crawlDone: row.crawlDone,
              crawlTotal: row.crawlTotal,
            }))}
            totalQueries={totalQueries}
          />

          <CompetitorConfidencePanel
            projectId={project.id}
            competitorId={featured?.id ?? null}
            domain={featured?.domain ?? null}
            confidence={featured?.confidence ?? null}
            band={featured?.confidenceBand ?? null}
          />
        </div>
      ) : null}

      {showDashboard ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <CompetitorSeoComparison columns={comparisonColumns} />
          <ContentOpportunities
            competitorsAnalyzed={ready.length}
            rows={opportunities.map((row) => ({
              id: row.id,
              title: row.title,
              competitorCount: row.gap?.competitorCount ?? 0,
              competitorsTotal: ready.length,
              selfCoverage: null,
              score: row.score,
              band: row.band,
            }))}
          />
        </div>
      ) : null}

      {featured ? (
        <CompetitorFeatured
          projectId={project.id}
          competitorId={featured.id}
          domain={featured.domain}
          name={featured.name}
          seoScore={featured.seoScore}
          pageCount={featured.pageCount}
          avgWordCount={featuredAnalysis?.avgWordCount ?? null}
          schemaCoverage={featuredAnalysis?.schemaCoverage ?? null}
          parts={readParts(featuredAnalysis?.confidenceParts)}
          dimensions={{
            technical: featuredAnalysis?.technicalScore ?? null,
            onPage: featuredAnalysis?.onPageScore ?? null,
            content: featuredAnalysis?.contentScore ?? null,
            performance: featuredAnalysis?.performanceScore ?? null,
            internalLinks: featuredAnalysis?.internalLinksScore ?? null,
            structuredData: featuredAnalysis?.structuredDataScore ?? null,
          }}
        />
      ) : null}

      <CompetitorAddForm
        projectId={project.id}
        disabled={!planAllows}
        disabledReason={
          planAllows ? undefined : "Competitor tracking is available on the Pro and Agency plans."
        }
      />
    </div>
  );
}
